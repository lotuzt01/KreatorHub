import crypto from 'crypto';
import type {
  Order,
  Product,
  StoreSettings,
  TelegramConnectionStatus,
  TelegramLog,
} from '../src/types/store.js';
import { loadDatabase, saveDatabase } from './store.js';

interface TelegramMessage {
  message_id?: number;
  date?: number;
  text?: string;
  chat?: { id?: number | string };
  reply_to_message?: {
    message_id?: number;
    text?: string;
  };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface ParsedBankInstruction {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getEffectiveChatId(settings: StoreSettings): string {
  const override = settings.telegram.customChatIdOverride?.trim();
  if (override) return override;
  return (process.env.TELEGRAM_CHAT_ID || '').trim();
}

function maskChatId(chatId: string): string {
  if (!chatId) return '';
  if (chatId.length <= 4) return '****';
  return `${chatId.slice(0, 2)}${'*'.repeat(Math.max(2, chatId.length - 4))}${chatId.slice(-2)}`;
}

export function getTelegramConnectionStatus(settings: StoreSettings): TelegramConnectionStatus {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const envChatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  const effectiveChatId = getEffectiveChatId(settings);

  return {
    botTokenConfigured: botToken.length > 10,
    envChatIdConfigured: envChatId.length > 0,
    effectiveChatIdMasked: effectiveChatId ? maskChatId(effectiveChatId) : null,
  };
}

function appendLog(log: TelegramLog): void {
  const db = loadDatabase();
  db.telegramLogs.unshift(log);
  if (db.telegramLogs.length > 50) {
    db.telegramLogs = db.telegramLogs.slice(0, 50);
  }
  saveDatabase(db);
}

export async function dispatchTelegramNotification(params: {
  event: TelegramLog['event'];
  text: string;
  orderId?: string;
}): Promise<{ status: TelegramLog['status']; detail: string; messageId?: number }> {
  const db = loadDatabase();
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = getEffectiveChatId(db.settings);

  if (!botToken || !chatId) {
    const missingParts: string[] = [];
    if (!botToken) missingParts.push('TELEGRAM_BOT_TOKEN');
    if (!chatId) missingParts.push('TELEGRAM_CHAT_ID');
    const detail = `Belum dikonfigurasi (${missingParts.join(' & ')} belum diatur di Secrets).`;
    appendLog({
      id: `tg-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      event: params.event,
      orderId: params.orderId,
      status: 'not_configured',
      detail,
      preview: params.text,
    });
    return { status: 'not_configured', detail };
  }

  try {
    // Hardcoded official Telegram Bot API endpoint (prevents SSRF)
    const endpoint = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: params.text,
        disable_web_page_preview: true,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: { message_id?: number } }
      | null;

    if (!response.ok || !payload?.ok) {
      const errDetail = payload?.description || `HTTP ${response.status}`;
      appendLog({
        id: `tg-${crypto.randomUUID().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
        event: params.event,
        orderId: params.orderId,
        status: 'failed',
        detail: `Gagal mengirim ke Telegram: ${errDetail}`,
        preview: params.text,
      });
      return { status: 'failed', detail: errDetail };
    }

    const detail = 'Terkirim real-time ke Telegram.';
    appendLog({
      id: `tg-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      event: params.event,
      orderId: params.orderId,
      status: 'sent',
      detail,
      preview: params.text,
    });
    return { status: 'sent', detail, messageId: payload.result?.message_id };
  } catch (error) {
    const errDetail = error instanceof Error ? error.message : 'Koneksi jaringan gagal';
    appendLog({
      id: `tg-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      event: params.event,
      orderId: params.orderId,
      status: 'failed',
      detail: `Kesalahan pengiriman: ${errDetail}`,
      preview: params.text,
    });
    return { status: 'failed', detail: errDetail };
  }
}

export function buildOrderTelegramMessage(
  order: Order,
  settings: StoreSettings,
  stage: 'created' | 'transfer_submitted' | 'paid',
): string {
  const header = settings.telegram.messageHeader || `Notifikasi ${settings.theme.storeName}`;

  if (stage === 'transfer_submitted') {
    const bankName = order.adminBankName || 'Bank';
    const bankNumber = order.adminBankNumber || '-';
    const nominal = order.adminTransferAmount ?? order.totalAmount;
    return [
      `KONFIRMASI TRANSFER PEMBELI — ${settings.theme.storeName}`,
      `Invoice: ${order.invoiceCode}`,
      `Pembeli: ${order.customerName}`,
      `Kontak: ${order.customerPhone}`,
      `Bank Tujuan: ${bankName} (${bankNumber})`,
      `Nominal Transfer: ${formatRupiah(nominal)}`,
      '',
      'Cek mutasi rekening Anda, lalu BALAS (Reply) pesan ini dengan:',
      'LUNAS',
      `(atau kirim: /lunas ${order.invoiceCode})`,
      'Untuk membatalkan pesanan, balas: BATAL',
    ].join('\n');
  }

  const isTelegramBank = order.paymentMethod === 'telegram_bank';
  const statusLabel =
    stage === 'paid'
      ? 'LUNAS (File Terkirim Otomatis)'
      : isTelegramBank
        ? 'MENUNGGU REKENING & NOMINAL DARI ADMIN'
        : 'MENUNGGU PEMBAYARAN';
  const itemLines = order.items
    .map((item) => `• ${item.title} (${item.quantity}x) — ${formatRupiah(item.price * item.quantity)}`)
    .join('\n');

  const lines = [
    header,
    `Status: ${statusLabel}`,
    `Invoice: ${order.invoiceCode}`,
    `Pembeli: ${order.customerName}`,
    `Email: ${order.customerEmail}`,
    `Kontak: ${order.customerPhone}`,
    '',
    'Rincian Produk:',
    itemLines,
    '',
    `Estimasi Total: ${formatRupiah(order.totalAmount)}`,
  ];

  if (stage === 'created' && isTelegramBank) {
    lines.push(
      '',
      'BALAS (Reply) pesan ini untuk mengirim rekening & nominal ke layar pembeli:',
      'Nama Bank | Nomor Rekening | Nominal',
      `Contoh: BCA | 1234567890 | ${order.totalAmount}`,
      `(Opsional tambah nama: BCA | 1234567890 | ${order.totalAmount} | Nama Anda)`,
      `Atau ketik: /bayar ${order.invoiceCode} | BCA | 1234567890 | ${order.totalAmount}`,
    );
  } else {
    lines.push(`Referensi: ${order.paymentReference}`);
  }

  return lines.join('\n');
}

function parseAmountValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutCurrency = trimmed.replace(/\b(?:rp|idr)\b\.?/gi, '').trim();
  if (/[a-zA-Z]/.test(withoutCurrency)) return null;
  const digits = withoutCurrency.replace(/[^\d]/g, '');
  if (!digits || digits.length < 3 || digits.length > 12) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed < 100) return null;
  return parsed;
}

function cleanAccountNumber(raw: string): string | null {
  const cleaned = raw.replace(/^(?:no\.?\s*rek(?:ening)?|rekening|norek|nomor|rek)\s*[:=-]?\s*/i, '').trim();
  const digits = cleaned.replace(/[\s-]/g, '');
  if (!/^\d{5,26}$/.test(digits)) return null;
  return digits;
}

export function parseAdminBankInstruction(rawText: string, invoiceCode: string): ParsedBankInstruction | null {
  let text = rawText.trim();
  if (!text) return null;

  text = text.replace(/^\/(?:bayar|rekening|bank|kirim|confirm)(?:@\w+)?\s*/i, '').trim();
  const invPattern = new RegExp(`^${invoiceCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[|,:;-]?\\s*`, 'i');
  text = text.replace(invPattern, '').trim();

  const bankMatch = text.match(/(?:^|\n)\s*(?:nama\s*)?bank\s*[:=-]\s*([^\n]+)/i);
  const accMatch = text.match(/(?:^|\n)\s*(?:no\.?\s*rek(?:ening)?|rekening|norek|nomor\s*(?:bank|rekening)?)\s*[:=-]\s*([^\n]+)/i);
  const nominalMatch = text.match(/(?:^|\n)\s*(?:nominal|jumlah|total|harga|bayar|transfer)\s*[:=-]\s*([^\n]+)/i);
  const holderMatch = text.match(/(?:^|\n)\s*(?:a\.?\/?n\.?|atas\s*nama|nama\s*pemilik|pemilik)\s*[:=-]\s*([^\n]+)/i);

  if (bankMatch && accMatch && nominalMatch) {
    const bankName = bankMatch[1].trim().slice(0, 60);
    const accountNumber = cleanAccountNumber(accMatch[1]);
    const amount = parseAmountValue(nominalMatch[1]);
    const accountHolder = holderMatch ? holderMatch[1].trim().slice(0, 80) : '';
    if (bankName.length >= 2 && accountNumber && amount) {
      return { bankName, accountNumber, accountHolder, amount };
    }
  }

  let parts: string[] = [];
  if (text.includes('|')) {
    parts = text.split('|').map((s) => s.trim()).filter(Boolean);
  } else if (text.includes('\n')) {
    parts = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } else if (text.includes(';')) {
    parts = text.split(';').map((s) => s.trim()).filter(Boolean);
  } else if (text.includes(',')) {
    parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (/\s+-\s+/.test(text)) {
    parts = text.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  } else {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) {
      const amountIdx = tokens.length - 1;
      const accIdx = tokens.findIndex((tok, i) => i > 0 && i < amountIdx && cleanAccountNumber(tok) !== null);
      if (accIdx > 0) {
        const bankName = tokens.slice(0, accIdx).join(' ');
        const accountNumber = cleanAccountNumber(tokens[accIdx]);
        const amount = parseAmountValue(tokens[amountIdx]);
        const middleHolder = tokens.slice(accIdx + 1, amountIdx).join(' ');
        if (bankName.length >= 2 && accountNumber && amount) {
          return {
            bankName: bankName.slice(0, 60),
            accountNumber,
            accountHolder: middleHolder.slice(0, 80),
            amount,
          };
        }
      }
    }
  }

  if (parts.length >= 3) {
    const bankName = parts[0].replace(/^(?:nama\s*)?bank\s*[:=-]?\s*/i, '').trim().slice(0, 60);
    const accountNumber = cleanAccountNumber(parts[1]);
    if (!bankName || bankName.length < 2 || !accountNumber) return null;

    if (parts.length === 3) {
      const amount = parseAmountValue(parts[2]);
      if (!amount) return null;
      return { bankName, accountNumber, accountHolder: '', amount };
    }

    const amountFrom2 = parseAmountValue(parts[2]);
    const amountFrom3 = parseAmountValue(parts[3]);
    if (amountFrom2 !== null) {
      const holder = parts
        .slice(3)
        .join(' ')
        .replace(/^(?:a\.?\/?n\.?|atas\s*nama)\s*[:=-]?\s*/i, '')
        .trim()
        .slice(0, 80);
      return { bankName, accountNumber, accountHolder: holder, amount: amountFrom2 };
    }
    if (amountFrom3 !== null) {
      const holder = parts[2]
        .replace(/^(?:a\.?\/?n\.?|atas\s*nama)\s*[:=-]?\s*/i, '')
        .trim()
        .slice(0, 80);
      return { bankName, accountNumber, accountHolder: holder, amount: amountFrom3 };
    }
  }

  return null;
}

function isConfirmPaidCommand(text: string, invoiceCode: string): boolean {
  const clean = text.trim();
  const invRegex = new RegExp(`^\\/(?:lunas|konfirmasi|acc|paid)(?:@\\w+)?\\s+${invoiceCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (invRegex.test(clean)) return true;
  return /^(?:\/(?:lunas|konfirmasi|acc|paid)(?:@\w+)?|lunas|ok|acc|paid|konfirmasi|berhasil|sah|setuju|done|terima)\b/i.test(clean);
}

function isCancelCommand(text: string, invoiceCode: string): boolean {
  const clean = text.trim();
  const invRegex = new RegExp(`^\\/(?:batal|cancel|tolak)(?:@\\w+)?\\s+${invoiceCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (invRegex.test(clean)) return true;
  return /^(?:\/(?:batal|cancel|tolak)(?:@\w+)?|batal|cancel|tolak)\b/i.test(clean);
}

let cachedUpdates: TelegramUpdate[] = [];
let lastPollAt = 0;

async function fetchTelegramUpdatesThrottled(botToken: string): Promise<TelegramUpdate[]> {
  const now = Date.now();
  if (now - lastPollAt < 2000 && cachedUpdates.length > 0) {
    return cachedUpdates;
  }
  lastPollAt = now;

  const baseUrl = `https://api.telegram.org/bot${encodeURIComponent(botToken)}`;
  const buildUrl = (offset?: number) => {
    const params = new URLSearchParams({
      limit: '100',
      timeout: '0',
      allowed_updates: JSON.stringify(['message']),
    });
    if (typeof offset === 'number') params.set('offset', String(offset));
    return `${baseUrl}/getUpdates?${params.toString()}`;
  };

  try {
    let res = await fetch(buildUrl());
    let payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error_code?: number; description?: string; result?: TelegramUpdate[] }
      | null;

    if (payload && !payload.ok && payload.error_code === 409 && /webhook/i.test(payload.description || '')) {
      await fetch(`${baseUrl}/deleteWebhook?drop_pending_updates=false`, { method: 'POST' }).catch(() => null);
      res = await fetch(buildUrl());
      payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; error_code?: number; description?: string; result?: TelegramUpdate[] }
        | null;
    }

    if (res.ok && payload?.ok && Array.isArray(payload.result)) {
      let updates = payload.result;
      if (updates.length >= 100) {
        const keepFrom = updates[50].update_id;
        const nextRes = await fetch(buildUrl(keepFrom)).catch(() => null);
        const nextPayload = (await nextRes?.json().catch(() => null)) as
          | { ok?: boolean; result?: TelegramUpdate[] }
          | null;
        if (nextPayload?.ok && Array.isArray(nextPayload.result)) {
          updates = nextPayload.result;
        }
      }
      cachedUpdates = updates;
    }
  } catch {
    // Return cached updates if transient network error
  }
  return cachedUpdates;
}

export async function syncOrderFromTelegram(order: Order, settings: StoreSettings): Promise<boolean> {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = getEffectiveChatId(settings);
  if (!botToken || !chatId) return false;
  if (order.status === 'PAID' || order.status === 'CANCELLED') return false;

  const updates = await fetchTelegramUpdatesThrottled(botToken);
  const invoiceUpper = order.invoiceCode.toUpperCase();

  let bank: ParsedBankInstruction | null = null;
  let paid = false;
  let cancelled = false;

  for (const upd of updates) {
    const msg = upd.message;
    if (!msg || !msg.text || !msg.chat?.id) continue;
    if (String(msg.chat.id) !== chatId) continue;

    const text = msg.text.trim();
    const replyId = msg.reply_to_message?.message_id || 0;
    const replyText = (msg.reply_to_message?.text || '').toUpperCase();
    const textUpper = text.toUpperCase();

    const matchesByReplyId =
      (order.telegramOrderMessageId && replyId === order.telegramOrderMessageId) ||
      (order.telegramTransferMessageId && replyId === order.telegramTransferMessageId);
    const matchesByReplyText = replyText.includes(invoiceUpper);
    const matchesByText = textUpper.includes(invoiceUpper);

    if (!matchesByReplyId && !matchesByReplyText && !matchesByText) continue;

    if (isCancelCommand(text, order.invoiceCode)) {
      cancelled = true;
      continue;
    }
    if (isConfirmPaidCommand(text, order.invoiceCode)) {
      paid = true;
      continue;
    }

    const parsed = parseAdminBankInstruction(text, order.invoiceCode);
    if (parsed) {
      bank = parsed;
    }
  }

  let changed = false;

  if (bank) {
    if (
      order.adminBankName !== bank.bankName ||
      order.adminBankNumber !== bank.accountNumber ||
      order.adminBankHolder !== bank.accountHolder ||
      order.adminTransferAmount !== bank.amount ||
      order.status === 'AWAITING_BANK'
    ) {
      order.adminBankName = bank.bankName;
      order.adminBankNumber = bank.accountNumber;
      order.adminBankHolder = bank.accountHolder;
      order.adminTransferAmount = bank.amount;
      if (order.status === 'AWAITING_BANK') {
        order.status = 'PENDING';
      }
      changed = true;
    }
  }

  if (cancelled) {
    order.status = 'CANCELLED';
    changed = true;
  } else if (paid) {
    order.status = 'PAID';
    order.paidAt = order.paidAt || new Date().toISOString();
    changed = true;
  }

  return changed;
}

export async function notifyLowStockIfNeeded(product: Product): Promise<void> {
  const db = loadDatabase();
  const prefs = db.settings.telegram;
  if (!prefs.notifyOnLowStock || product.unlimitedStock) return;
  if (product.stock > prefs.lowStockThreshold) return;

  const text = [
    `Peringatan Stok Menipis — ${db.settings.theme.storeName}`,
    `Produk: ${product.title}`,
    `Kategori: ${product.category}`,
    `Sisa Stok: ${product.stock} unit`,
    'Segera perbarui stok melalui Dasbor Admin agar penjualan tetap berjalan.',
  ].join('\n');

  await dispatchTelegramNotification({
    event: 'low_stock',
    text,
  });
}
