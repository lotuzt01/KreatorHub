import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

interface OrderItemInput {
  title?: string;
  quantity?: number;
  price?: number;
}

interface TelegramRequestBody {
  event?: 'order_created' | 'transfer_submitted' | 'order_paid' | 'test';
  storeName?: string;
  invoiceCode?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentMethod?: string;
  paymentReference?: string;
  totalAmount?: number;
  items?: OrderItemInput[];
  chatIdOverride?: string;
  messageHeader?: string;
  adminBankName?: string;
  adminBankNumber?: string;
  adminBankHolder?: string;
  adminTransferAmount?: number;
}

interface ParsedBankInstruction {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
}

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

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const allowedOrigin = (process.env.ALLOWED_ORIGIN || '').trim();
  const origin = req.headers.origin;
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Passcode');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function parseAmountValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Reject strings that have letters other than Rp / IDR
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

function parseAdminBankInstruction(rawText: string, invoiceCode: string): ParsedBankInstruction | null {
  let text = rawText.trim();
  if (!text) return null;

  // Strip optional /bayar or /rekening command and invoice code prefix
  text = text.replace(/^\/(?:bayar|rekening|bank|kirim|confirm)(?:@\w+)?\s*/i, '').trim();
  const invPattern = new RegExp(`^${invoiceCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[|,:;-]?\\s*`, 'i');
  text = text.replace(invPattern, '').trim();

  // Mode A: Labeled multiline/key-value format (e.g. Bank: BCA \n Rekening: 123456 \n Nominal: 129000)
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

  // Mode B: Delimited format (|, ;, newline, or comma)
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
    // Space-separated fallback: e.g. "BCA 1234567890 129123"
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

    // 4+ parts: determine which of parts[2] / parts[3] is nominal vs account holder
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
  if (/^(?:\/(?:lunas|konfirmasi|acc|paid)(?:@\w+)?|lunas|ok|acc|paid|konfirmasi|berhasil|sah|setuju|done|terima)\b/i.test(clean)) {
    return true;
  }
  return false;
}

function isCancelCommand(text: string, invoiceCode: string): boolean {
  const clean = text.trim();
  const invRegex = new RegExp(`^\\/(?:batal|cancel|tolak)(?:@\\w+)?\\s+${invoiceCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (invRegex.test(clean)) return true;
  if (/^(?:\/(?:batal|cancel|tolak)(?:@\w+)?|batal|cancel|tolak)\b/i.test(clean)) {
    return true;
  }
  return false;
}

async function fetchTelegramUpdates(botToken: string): Promise<TelegramUpdate[]> {
  const baseUrl = `https://api.telegram.org/bot${encodeURIComponent(botToken)}`;
  const buildUrl = (offset?: number) => {
    const params = new URLSearchParams({
      limit: '100',
      timeout: '0',
      allowed_updates: JSON.stringify(['message']),
    });
    if (typeof offset === 'number') {
      params.set('offset', String(offset));
    }
    return `${baseUrl}/getUpdates?${params.toString()}`;
  };

  let res = await fetch(buildUrl());
  let payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; error_code?: number; description?: string; result?: TelegramUpdate[] }
    | null;

  // If a stale webhook was previously attached to the bot, clear it safely once and retry
  if (payload && !payload.ok && payload.error_code === 409 && /webhook/i.test(payload.description || '')) {
    await fetch(`${baseUrl}/deleteWebhook?drop_pending_updates=false`, { method: 'POST' }).catch(() => null);
    res = await fetch(buildUrl());
    payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; error_code?: number; description?: string; result?: TelegramUpdate[] }
      | null;
  }

  if (!res.ok || !payload?.ok || !Array.isArray(payload.result)) {
    return [];
  }

  let updates = payload.result;
  // If queue hit the 100-update cap, advance offset while keeping the newest 50 updates available
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

  return updates;
}

function getQueryParam(req: VercelRequest, key: string): string {
  if (req.query && req.query[key] !== undefined) {
    const val = req.query[key];
    return Array.isArray(val) ? String(val[0] || '') : String(val || '');
  }
  const url = new URL(req.url || '/', 'http://localhost');
  return url.searchParams.get(key) || '';
}

async function handlePollOrderStatus(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!botToken || !chatId) {
    res.status(200).json({
      configured: false,
      stage: 'AWAITING_BANK',
      bank: null,
    });
    return;
  }

  const invoiceCode = getQueryParam(req, 'invoiceCode').trim();
  if (!/^INV-[A-Z0-9-]+$/i.test(invoiceCode)) {
    res.status(400).json({ error: 'Format invoiceCode tidak valid.' });
    return;
  }

  const orderMsgIdRaw = Number(getQueryParam(req, 'orderMsgId') || 0);
  const transferMsgIdRaw = Number(getQueryParam(req, 'transferMsgId') || 0);
  const orderMsgId = Number.isFinite(orderMsgIdRaw) && orderMsgIdRaw > 0 ? orderMsgIdRaw : 0;
  const transferMsgId = Number.isFinite(transferMsgIdRaw) && transferMsgIdRaw > 0 ? transferMsgIdRaw : 0;

  try {
    const updates = await fetchTelegramUpdates(botToken);
    const invoiceUpper = invoiceCode.toUpperCase();

    let bank: ParsedBankInstruction | null = null;
    let paid = false;
    let cancelled = false;

    for (const upd of updates) {
      const msg = upd.message;
      if (!msg || !msg.text || !msg.chat?.id) continue;
      // Strict security check: only accept messages from the authorized store admin TELEGRAM_CHAT_ID
      if (String(msg.chat.id) !== chatId) continue;

      const text = msg.text.trim();
      const replyId = msg.reply_to_message?.message_id || 0;
      const replyText = (msg.reply_to_message?.text || '').toUpperCase();
      const textUpper = text.toUpperCase();

      const matchesByReplyId =
        (orderMsgId > 0 && replyId === orderMsgId) ||
        (transferMsgId > 0 && replyId === transferMsgId);
      const matchesByReplyText = replyText.includes(invoiceUpper);
      const matchesByText = textUpper.includes(invoiceUpper);

      if (!matchesByReplyId && !matchesByReplyText && !matchesByText) {
        continue;
      }

      if (isCancelCommand(text, invoiceCode)) {
        cancelled = true;
        continue;
      }

      if (isConfirmPaidCommand(text, invoiceCode)) {
        paid = true;
        continue;
      }

      const parsed = parseAdminBankInstruction(text, invoiceCode);
      if (parsed) {
        bank = parsed;
      }
    }

    const stage = cancelled
      ? 'CANCELLED'
      : paid
        ? 'PAID'
        : bank
          ? 'BANK_READY'
          : 'AWAITING_BANK';

    res.status(200).json({
      configured: true,
      stage,
      bank,
    });
  } catch (err) {
    res.status(502).json({
      configured: true,
      stage: 'AWAITING_BANK',
      bank: null,
      error: err instanceof Error ? err.message : 'Gagal membaca balasan Telegram.',
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET') {
    await handlePollOrderStatus(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as TelegramRequestBody;
  const chatId = String(body.chatIdOverride || process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!botToken || !chatId) {
    res.status(200).json({
      status: 'not_configured',
      detail: 'Tambahkan TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di Vercel Environment Variables.',
    });
    return;
  }

  const event = body.event;
  if (
    event !== 'order_created' &&
    event !== 'transfer_submitted' &&
    event !== 'order_paid' &&
    event !== 'test'
  ) {
    res.status(400).json({ error: 'Jenis event Telegram tidak valid.' });
    return;
  }

  // If ADMIN_PASSCODE is configured on Vercel, verify it for manual test pings
  const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
  if (event === 'test' && envPasscode) {
    const provided = String(req.headers['x-admin-passcode'] || '').trim();
    if (!provided || !safeEqual(provided, envPasscode)) {
      res.status(401).json({ error: 'ADMIN_PASSCODE diperlukan untuk uji koneksi Telegram.' });
      return;
    }
  }

  const storeName = String(body.storeName || 'Karsa Digital').slice(0, 80);
  const header = String(body.messageHeader || `Notifikasi Pesanan ${storeName}`).slice(0, 120);
  const invoiceCode = String(body.invoiceCode || '-').slice(0, 40);
  const customerName = String(body.customerName || '-').slice(0, 80);
  const customerEmail = String(body.customerEmail || '-').slice(0, 100);
  const customerPhone = String(body.customerPhone || '-').slice(0, 40);
  const totalAmount = Math.max(0, Math.round(Number(body.totalAmount || 0)));

  let text = '';
  if (event === 'test') {
    text = [
      `Uji Koneksi Bot Telegram — ${storeName}`,
      `Waktu: ${new Date().toLocaleString('id-ID')}`,
      'Status: Integrasi 2-arah Telegram aktif. Anda bisa langsung balas pesanan masuk dengan Nama Bank | Nomor Rekening | Nominal.',
    ].join('\n');
  } else if (event === 'transfer_submitted') {
    const bankName = String(body.adminBankName || 'Bank').slice(0, 60);
    const bankNumber = String(body.adminBankNumber || '-').slice(0, 40);
    const nominal = Math.max(0, Math.round(Number(body.adminTransferAmount || totalAmount)));
    text = [
      `KONFIRMASI TRANSFER PEMBELI — ${storeName}`,
      `Invoice: ${invoiceCode}`,
      `Pembeli: ${customerName}`,
      `Kontak: ${customerPhone}`,
      `Bank Tujuan: ${bankName} (${bankNumber})`,
      `Nominal Transfer: ${formatRupiah(nominal)}`,
      '',
      'Cek mutasi rekening Anda, lalu BALAS (Reply) pesan ini dengan:',
      'LUNAS',
      `(atau kirim: /lunas ${invoiceCode})`,
      'Untuk membatalkan pesanan, balas: BATAL',
    ].join('\n');
  } else {
    const isTelegramBank = body.paymentMethod === 'telegram_bank';
    const statusLabel =
      event === 'order_paid'
        ? 'LUNAS (File Terkirim Otomatis)'
        : isTelegramBank
          ? 'MENUNGGU REKENING & NOMINAL DARI ADMIN'
          : 'MENUNGGU PEMBAYARAN';
    const items = Array.isArray(body.items) ? body.items.slice(0, 15) : [];
    const itemLines = items
      .map((i) => {
        const title = String(i.title || 'Produk Digital').slice(0, 100);
        const qty = Math.max(1, Math.min(50, Math.floor(Number(i.quantity || 1))));
        const price = Math.max(0, Math.round(Number(i.price || 0)));
        return `• ${title} (${qty}x) — ${formatRupiah(price * qty)}`;
      })
      .join('\n');

    const lines = [
      header,
      `Status: ${statusLabel}`,
      `Invoice: ${invoiceCode}`,
      `Pembeli: ${customerName}`,
      `Email: ${customerEmail}`,
      `Kontak: ${customerPhone}`,
      '',
      'Rincian Produk:',
      itemLines || '• Produk Digital',
      '',
      `Estimasi Total: ${formatRupiah(totalAmount)}`,
    ];

    if (event === 'order_created' && isTelegramBank) {
      lines.push(
        '',
        'BALAS (Reply) pesan ini untuk mengirim rekening & nominal ke layar pembeli:',
        'Nama Bank | Nomor Rekening | Nominal',
        `Contoh: BCA | 1234567890 | ${totalAmount}`,
        `(Opsional tambah nama: BCA | 1234567890 | ${totalAmount} | Nama Anda)`,
        `Atau ketik: /bayar ${invoiceCode} | BCA | 1234567890 | ${totalAmount}`,
      );
    } else {
      lines.push(`Referensi: ${String(body.paymentReference || '-').slice(0, 60)}`);
    }

    text = lines.join('\n');
  }

  try {
    // Hardcoded official Telegram Bot API endpoint
    const endpoint = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
    const tgRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    const tgPayload = (await tgRes.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: { message_id?: number } }
      | null;

    if (!tgRes.ok || !tgPayload?.ok) {
      res.status(502).json({
        status: 'failed',
        detail: tgPayload?.description || `HTTP ${tgRes.status}`,
      });
      return;
    }

    res.status(200).json({
      status: 'sent',
      messageId: tgPayload.result?.message_id ?? null,
      detail: 'Notifikasi terkirim real-time ke Telegram melalui Vercel Serverless.',
      preview: text,
    });
  } catch (err) {
    res.status(502).json({
      status: 'failed',
      detail: err instanceof Error ? err.message : 'Gagal menghubungi server Telegram.',
    });
  }
}
