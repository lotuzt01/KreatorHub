import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
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
  event?: 'order_created' | 'order_paid' | 'test';
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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  res.setHeader('X-Content-Type-Options', 'nosniff');

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
  if (event !== 'order_created' && event !== 'order_paid' && event !== 'test') {
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

  let text = '';
  if (event === 'test') {
    text = [
      `Uji Koneksi Bot Telegram — ${storeName}`,
      `Waktu: ${new Date().toLocaleString('id-ID')}`,
      'Status: Integrasi Vercel Serverless Bot Telegram aktif dan siap menerima pesanan.',
    ].join('\n');
  } else {
    const statusLabel = event === 'order_paid' ? 'LUNAS (File Terkirim Otomatis)' : 'MENUNGGU PEMBAYARAN';
    const items = Array.isArray(body.items) ? body.items.slice(0, 15) : [];
    const itemLines = items
      .map((i) => {
        const title = String(i.title || 'Produk Digital').slice(0, 100);
        const qty = Math.max(1, Math.min(50, Math.floor(Number(i.quantity || 1))));
        const price = Math.max(0, Math.round(Number(i.price || 0)));
        return `• ${title} (${qty}x) — ${formatRupiah(price * qty)}`;
      })
      .join('\n');

    text = [
      header,
      `Status: ${statusLabel}`,
      `Invoice: ${String(body.invoiceCode || '-').slice(0, 40)}`,
      `Pembeli: ${String(body.customerName || '-').slice(0, 80)}`,
      `Email: ${String(body.customerEmail || '-').slice(0, 100)}`,
      `Kontak: ${String(body.customerPhone || '-').slice(0, 40)}`,
      '',
      'Rincian Produk:',
      itemLines || '• Produk Digital',
      '',
      `Total Bayar: ${formatRupiah(Math.max(0, Math.round(Number(body.totalAmount || 0))))}`,
      `Referensi: ${String(body.paymentReference || '-').slice(0, 60)}`,
    ].join('\n');
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
      | { ok?: boolean; description?: string }
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
