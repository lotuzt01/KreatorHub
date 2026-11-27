import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
}

interface PaymentCreateBody {
  invoiceCode?: string;
  totalAmount?: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentMethod?: string;
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const allowedOrigin = (process.env.ALLOWED_ORIGIN || '').trim();
  const origin = req.headers.origin;
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (applyCors(req, res)) return;
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as PaymentCreateBody;
  const invoiceCode = String(body.invoiceCode || `INV-${Date.now()}`).slice(0, 48);
  const totalAmount = Math.round(Number(body.totalAmount || 0));
  const customerName = String(body.customerName || 'Pelanggan').slice(0, 100);
  const customerEmail = String(body.customerEmail || '').slice(0, 120);
  const customerPhone = String(body.customerPhone || '').slice(0, 30);

  if (!Number.isFinite(totalAmount) || totalAmount < 1000) {
    res.status(400).json({ error: 'Nominal pembayaran tidak valid.' });
    return;
  }

  const midtransKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();
  const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  if (midtransKey) {
    try {
      const snapEndpoint = isProd
        ? 'https://app.midtrans.com/snap/v1/transactions'
        : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

      const authHeader = `Basic ${Buffer.from(`${midtransKey}:`).toString('base64')}`;
      const response = await fetch(snapEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          transaction_details: {
            order_id: invoiceCode,
            gross_amount: totalAmount,
          },
          customer_details: {
            first_name: customerName,
            email: customerEmail,
            phone: customerPhone,
          },
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { token?: string; redirect_url?: string; error_messages?: string[] }
        | null;

      if (!response.ok || !data?.redirect_url) {
        res.status(502).json({
          error: data?.error_messages?.[0] || `Midtrans HTTP ${response.status}`,
        });
        return;
      }

      res.status(200).json({
        provider: 'midtrans',
        mode: isProd ? 'production' : 'sandbox',
        paymentReference: invoiceCode,
        paymentUrl: data.redirect_url,
        snapToken: data.token,
      });
      return;
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Gagal membuat transaksi Midtrans.',
      });
      return;
    }
  }

  // Built-in automated reference when Midtrans key is not configured yet
  const ref = `AUTO-${crypto.randomInt(10000000, 99999999)}`;
  res.status(200).json({
    provider: 'builtin_auto',
    mode: 'sandbox',
    paymentReference: ref,
    paymentUrl: null,
  });
}
