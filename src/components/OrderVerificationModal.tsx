import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Landmark,
  Link2,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import type { Order, OrderDownloadLink, Product, TelegramPreferences } from '../types/store';
import { formatDateTimeID, formatIDR, formatPaymentMethodLabel } from '../lib/format';
import { getAdminAuthHeaders, getAdminFirebaseIdToken } from '../lib/firebase';
import { fetchJsonWithWarmupRetry } from '../lib/apiClient';
import {
  adminCancelFirestoreOrder,
  adminConfirmFirestoreOrderPaid,
  adminSendFirestoreBankDetails,
  appendFirestoreTelegramLog,
} from '../lib/firestoreStore';

interface OrderVerificationModalProps {
  order: Order;
  products: Product[];
  storeName: string;
  telegramPrefs: TelegramPreferences;
  serverlessAvailable?: boolean;
  onClose: () => void;
  onVerified: (notice: string) => void;
}

export function OrderVerificationModal({
  order,
  products,
  storeName,
  telegramPrefs,
  serverlessAvailable = false,
  onClose,
  onVerified,
}: OrderVerificationModalProps) {
  const [bankName, setBankName] = useState(order.adminBankName || '');
  const [bankNumber, setBankNumber] = useState(order.adminBankNumber || '');
  const [bankHolder, setBankHolder] = useState(order.adminBankHolder || '');
  const [transferAmount, setTransferAmount] = useState(
    String(order.adminTransferAmount ?? order.totalAmount),
  );
  const [extraDeliveryNote, setExtraDeliveryNote] = useState('');
  const [busy, setBusy] = useState<'bank' | 'verify' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bankSentMsg, setBankSentMsg] = useState<string | null>(null);

  const handleSendBankDetails = async () => {
    setError(null);
    setBankSentMsg(null);

    const cleanBank = bankName.trim();
    const cleanDigits = bankNumber.replace(/[\s-]/g, '');
    const parsedAmount = Math.round(Number(transferAmount.replace(/[^\d]/g, '')));

    if (cleanBank.length < 2 || !/[a-zA-Z]{2,}/.test(cleanBank)) {
      setError('Nama bank wajib diisi dengan benar (mis. BCA, BRI, Mandiri, SeaBank).');
      return;
    }
    if (!/^\d{6,25}$/.test(cleanDigits)) {
      setError('Format nomor rekening bank tidak valid (harus 6–25 digit angka).');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 100) {
      setError('Nominal transfer harus berupa angka yang valid.');
      return;
    }

    setBusy('bank');
    try {
      await adminSendFirestoreBankDetails(order.id, order.status, {
        bankName: cleanBank,
        accountNumber: cleanDigits,
        accountHolder: bankHolder.trim(),
        amount: parsedAmount,
      });
      setBankSentMsg('Detail rekening langsung tampil secara real-time di layar pembeli.');
      onVerified(
        `Detail rekening ${cleanBank} (${cleanDigits}) berhasil dikirim real-time untuk ${order.invoiceCode}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim detail rekening.');
    } finally {
      setBusy(null);
    }
  };

  const productById = new Map(products.map((p) => [p.id, p]));

  const buildResolvedDownloadLinks = (): OrderDownloadLink[] => {
    const origin = window.location.origin;
    return order.items.map((item) => {
      const matched = productById.get(item.productId);
      const customUrl = matched?.downloadUrl?.trim();
      return {
        productId: item.productId,
        title: item.title,
        fileName: item.fileName,
        url:
          customUrl ||
          `${origin}/?invoice=${encodeURIComponent(order.invoiceCode)}&produk=${encodeURIComponent(item.productId)}`,
      };
    });
  };

  const handleVerifyAndSendTelegram = async () => {
    setError(null);
    setBusy('verify');
    const cleanedNote = extraDeliveryNote.trim().slice(0, 300);
    const resolvedDownloadLinks = buildResolvedDownloadLinks();

    try {
      let tgStatus: Order['telegramStatus'] = order.telegramStatus;
      let tgDetail = 'Pesanan diverifikasi Lunas dari Dasbor Admin.';
      let telegramInfo = `Pesanan ${order.invoiceCode} diverifikasi Lunas & tautan unduhan pembeli langsung terbuka secara real-time.`;

      if (serverlessAvailable) {
        const [headers, firebaseIdToken] = await Promise.all([
          getAdminAuthHeaders(),
          getAdminFirebaseIdToken(),
        ]);
        const { data: tgData } = await fetchJsonWithWarmupRetry<{
          status?: 'sent' | 'not_configured' | 'failed';
          detail?: string;
          preview?: string;
        }>('/api/telegram', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event: 'order_paid',
            storeName,
            invoiceCode: order.invoiceCode,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            customerPhone: order.customerPhone,
            paymentMethod: order.paymentMethod,
            paymentReference: order.paymentReference,
            totalAmount: order.totalAmount,
            adminTransferAmount: order.adminTransferAmount,
            items: order.items,
            downloadLinks: resolvedDownloadLinks,
            extraDeliveryNote: cleanedNote || undefined,
            chatIdOverride: telegramPrefs.customChatIdOverride || undefined,
            messageHeader: telegramPrefs.messageHeader,
            firebaseIdToken: firebaseIdToken || undefined,
          }),
        });

        if (tgData?.status) {
          tgStatus = tgData.status;
          tgDetail = tgData.detail || tgDetail;
          await appendFirestoreTelegramLog({
            event: 'order_paid',
            orderId: order.id,
            status: tgData.status,
            detail: tgDetail,
            preview: tgData.preview || `Invoice ${order.invoiceCode} LUNAS`,
          });
          telegramInfo =
            tgData.status === 'sent'
              ? `Pesanan ${order.invoiceCode} diverifikasi Lunas, link download produk langsung terbuka real-time di layar pembeli, & terkirim via Telegram.`
              : `Pesanan ${order.invoiceCode} diverifikasi Lunas & link produk langsung terbuka real-time (${tgData.detail || 'cek pengaturan Telegram'}).`;
        }
      }

      await adminConfirmFirestoreOrderPaid(
        order,
        {
          status: tgStatus,
          detail: tgDetail,
        },
        {
          downloadLinks: resolvedDownloadLinks,
          deliveryNote: cleanedNote || undefined,
        },
      );

      onVerified(telegramInfo);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi pesanan.');
    } finally {
      setBusy(null);
    }
  };

  const handleCancelOrder = async () => {
    setError(null);
    setBusy('cancel');
    try {
      await adminCancelFirestoreOrder(order.id);
      onVerified(`Pesanan ${order.invoiceCode} telah dibatalkan secara real-time.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membatalkan pesanan.');
    } finally {
      setBusy(null);
    }
  };

  const statusLabel =
    order.status === 'PAYMENT_SUBMITTED'
      ? 'Pembeli Sudah Transfer — Siap Verifikasi'
      : order.status === 'AWAITING_BANK'
        ? 'Menunggu Detail Rekening Admin'
        : order.status === 'PENDING'
          ? 'Menunggu Transfer Pembeli'
          : order.status;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Verifikasi pesanan ${order.invoiceCode}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-zinc-50">
                Verifikasi Pesanan Manual
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
              <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                {order.invoiceCode}
              </span>{' '}
              · {statusLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal verifikasi"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {bankSentMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{bankSentMsg}</span>
            </div>
          )}

          {/* Buyer & Payment Proof Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Pembeli</p>
                <p className="mt-0.5 font-semibold text-slate-900 dark:text-zinc-100">
                  {order.customerName}
                </p>
                <p className="text-slate-600 dark:text-zinc-400">{order.customerEmail}</p>
                <p className="font-mono text-slate-600 dark:text-zinc-400">{order.customerPhone}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Total &amp; Metode</p>
                <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                  {formatIDR(order.adminTransferAmount ?? order.totalAmount)}
                </p>
                <p className="text-slate-600 dark:text-zinc-400">
                  {formatPaymentMethodLabel(order.paymentMethod)}
                </p>
                <p className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                  {formatDateTimeID(order.createdAt)}
                </p>
              </div>
            </div>

            {order.adminBankName && (
              <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 dark:border-zinc-800">
                <Landmark className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <p className="text-slate-700 dark:text-zinc-200">
                  Rekening tujuan: <strong>{order.adminBankName}</strong> ·{' '}
                  <span className="font-mono font-semibold">{order.adminBankNumber}</span>
                  {order.adminBankHolder ? ` (a.n. ${order.adminBankHolder})` : ''}
                </p>
              </div>
            )}

            {order.transferProofNote ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Bukti / Catatan Transfer dari Pembeli
                </p>
                <p className="mt-1 text-xs font-medium">{order.transferProofNote}</p>
              </div>
            ) : order.status === 'PAYMENT_SUBMITTED' ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-[11px] text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                Pembeli telah menekan tombol <strong>Saya Sudah Transfer</strong>. Silakan cocokkan mutasi rekening Anda lalu klik Verifikasi Lunas di bawah.
              </div>
            ) : null}
          </div>

          {/* Send Bank Details directly from Dashboard (syncs live to buyer screen!) */}
          {order.status === 'AWAITING_BANK' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                Kirim Detail Rekening ke Layar Pembeli (Real-Time)
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                    Nama Bank
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Contoh: BCA / BRI"
                    className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                    Nomor Rekening
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bankNumber}
                    onChange={(e) => setBankNumber(e.target.value)}
                    placeholder="6–25 digit angka"
                    className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                    Atas Nama (Opsional)
                  </label>
                  <input
                    type="text"
                    value={bankHolder}
                    onChange={(e) => setBankHolder(e.target.value)}
                    placeholder="Nama pemilik rekening"
                    className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                    Nominal Transfer (Rp)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={handleSendBankDetails}
                className="mt-3 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{busy === 'bank' ? 'Mengirim...' : 'Kirim Rekening ke Layar Pembeli'}</span>
              </button>
            </div>
          )}

          {/* Product Items & Auto Link Preview */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-200">
              <Link2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <span>Link Produk yang Akan Dibuka Real-Time &amp; Dikirim via Telegram</span>
            </div>
            <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-xs dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {order.items.map((item) => {
                const customUrl = productById.get(item.productId)?.downloadUrl?.trim();
                return (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-zinc-100">
                        {item.quantity}x {item.title}
                      </p>
                      <p className="truncate font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                        {customUrl ? customUrl : `File: ${item.fileName}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-[11px] font-medium ${
                        customUrl
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {customUrl ? 'Link Aplikasi Siap' : 'Tautan Invoice'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Optional custom link / admin delivery note */}
          <div>
            <label
              htmlFor="extra-delivery-note"
              className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
            >
              Link Produk Tambahan / Catatan Admin (Opsional)
            </label>
            <input
              id="extra-delivery-note"
              type="text"
              maxLength={300}
              value={extraDeliveryNote}
              onChange={(e) => setExtraDeliveryNote(e.target.value)}
              placeholder="Mis. https://drive.google.com/... atau kode lisensi tambahan"
              className="mt-1.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <button
            type="button"
            disabled={busy !== null}
            onClick={handleCancelOrder}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{busy === 'cancel' ? 'Membatalkan...' : 'Batalkan Pesanan'}</span>
          </button>

          <button
            type="button"
            disabled={busy !== null}
            onClick={handleVerifyAndSendTelegram}
            style={{ backgroundColor: 'var(--store-accent)' }}
            className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:flex-none whitespace-nowrap"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {busy === 'verify'
                ? 'Memverifikasi & Mengirim Link...'
                : 'Verifikasi Lunas & Kirim Link via Telegram'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
