import type { IncomingMessage, ServerResponse } from 'http';

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const allowedOrigin = (process.env.ALLOWED_ORIGIN || '').trim();
  const origin = req.headers.origin;
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export default function handler(req: IncomingMessage, res: VercelResponse): void {
  if (applyCors(req, res)) return;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).json({
    ok: true,
    runtime: 'vercel-serverless',
    telegramBotConfigured: Boolean((process.env.TELEGRAM_BOT_TOKEN || '').trim()),
    telegramChatConfigured: Boolean((process.env.TELEGRAM_CHAT_ID || '').trim()),
    midtransConfigured: Boolean((process.env.MIDTRANS_SERVER_KEY || '').trim()),
    webhookSecretConfigured: Boolean((process.env.PAYMENT_WEBHOOK_SECRET || '').trim()),
    paymentMode: process.env.MIDTRANS_IS_PRODUCTION === 'true' ? 'production' : 'sandbox',
  });
}
