import crypto from 'crypto';
import type {
  Order,
  Product,
  StoreSettings,
  TelegramConnectionStatus,
  TelegramLog,
} from '../src/types/store.js';
import { loadDatabase, saveDatabase } from './store.js';

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
}): Promise<{ status: TelegramLog['status']; detail: string }> {
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
      | { ok?: boolean; description?: string }
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
    return { status: 'sent', detail };
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
  stage: 'created' | 'paid',
): string {
  const header = settings.telegram.messageHeader || `Notifikasi ${settings.theme.storeName}`;
  const statusLabel = stage === 'paid' ? 'LUNAS (File Terkirim Otomatis)' : 'MENUNGGU PEMBAYARAN';
  const itemLines = order.items
    .map((item) => `• ${item.title} (${item.quantity}x) — ${formatRupiah(item.price * item.quantity)}`)
    .join('\n');

  return [
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
    `Total Bayar: ${formatRupiah(order.totalAmount)}`,
    `Referensi: ${order.paymentReference}`,
  ].join('\n');
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
