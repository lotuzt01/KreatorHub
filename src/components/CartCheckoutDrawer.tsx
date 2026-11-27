import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Download,
  Minus,
  Plus,
  QrCode,
  Send,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import type { CartItem, Order, PaymentMethod, Product } from '../types/store';
import { formatIDR, formatPaymentMethodLabel } from '../lib/format';
import {
  confirmStaticOrderPayment,
  createStaticOrder,
  triggerStaticLicenseDownload,
} from '../lib/staticFallback';
import { SafeImage } from './SafeImage';

interface CartCheckoutDrawerProps {
  open: boolean;
  isStaticMode?: boolean;
  items: CartItem[];
  products: Product[];
  onClose: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onOrderCompleted: () => void;
}

type CheckoutStep = 'cart' | 'checkout' | 'payment' | 'success';

const PAYMENT_OPTIONS: Array<{ id: PaymentMethod; title: string; subtitle: string }> = [
  { id: 'qris', title: 'QRIS Otomatis', subtitle: 'Verifikasi instan semua e-wallet & m-banking' },
  { id: 'va_bca', title: 'Virtual Account BCA', subtitle: 'Konfirmasi otomatis tanpa unggah bukti' },
  { id: 'va_mandiri', title: 'Virtual Account Mandiri', subtitle: 'Nomor VA unik untuk pesanan ini' },
  { id: 'ewallet_gopay', title: 'GoPay Instan', subtitle: 'Pembayaran langsung dari aplikasi Gojek' },
  { id: 'ewallet_dana', title: 'DANA Instan', subtitle: 'Bebas biaya administrasi tambahan' },
];

export function CartCheckoutDrawer({
  open,
  isStaticMode = false,
  items,
  products,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderCompleted,
}: CartCheckoutDrawerProps) {
  const [step, setStep] = useState<CheckoutStep>('cart');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('qris');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  if (!open) return null;

  const resolvedCart = items
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return product ? { ...item, product } : null;
    })
    .filter((entry): entry is { productId: string; quantity: number; product: Product } => entry !== null);

  const subtotal = resolvedCart.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0);

  const handleClose = () => {
    setError(null);
    if (step === 'success') {
      setStep('cart');
      setActiveOrder(null);
    }
    onClose();
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (customerName.trim().length < 2) {
      setError('Masukkan nama lengkap Anda (minimal 2 karakter).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      setError('Masukkan alamat email yang valid untuk pengiriman lisensi.');
      return;
    }
    if (customerPhone.trim().length < 8) {
      setError('Masukkan nomor WhatsApp atau Telegram aktif.');
      return;
    }

    setSubmitting(true);
    try {
      if (isStaticMode) {
        const order = createStaticOrder({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          paymentMethod,
          items: resolvedCart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        });
        setActiveOrder(order);
        onClearCart();
        onOrderCompleted();
        setStep('payment');
        return;
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          paymentMethod,
          items: resolvedCart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        }),
      });
      const data = (await res.json()) as { order?: Order; error?: string };
      if (!res.ok || !data.order) {
        throw new Error(data.error || 'Gagal membuat pesanan.');
      }
      setActiveOrder(data.order);
      onClearCart();
      onOrderCompleted();
      setStep('payment');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses pesanan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!activeOrder) return;
    setError(null);
    setSubmitting(true);
    try {
      if (isStaticMode) {
        const paidOrder = confirmStaticOrderPayment(activeOrder.id);
        setActiveOrder(paidOrder);
        onOrderCompleted();
        setStep('success');
        return;
      }

      const res = await fetch(`/api/orders/${encodeURIComponent(activeOrder.id)}/pay`, {
        method: 'POST',
      });
      const data = (await res.json()) as { order?: Order; error?: string };
      if (!res.ok || !data.order) {
        throw new Error(data.error || 'Gagal memverifikasi pembayaran.');
      }
      setActiveOrder(data.order);
      onOrderCompleted();
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Keranjang belanja dan pembayaran"
      onClick={handleClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
              {step === 'cart' && 'Keranjang Belanja'}
              {step === 'checkout' && 'Data Pembeli & Pembayaran'}
              {step === 'payment' && 'Menunggu Pembayaran'}
              {step === 'success' && 'Pembayaran Lunas'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {step === 'cart' && `${resolvedCart.length} produk dipilih`}
              {step === 'checkout' && 'Akses unduhan dikirim otomatis setelah pembayaran terverifikasi'}
              {step === 'payment' && activeOrder?.invoiceCode}
              {step === 'success' && `Invoice ${activeOrder?.invoiceCode} terkonfirmasi`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Tutup keranjang"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: CART */}
          {step === 'cart' && (
            <>
              {resolvedCart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ShoppingBag className="h-10 w-10 text-slate-300 dark:text-zinc-700" aria-hidden="true" />
                  <p className="mt-4 font-display text-base font-semibold text-slate-900 dark:text-zinc-100">
                    Keranjang masih kosong
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-zinc-400">
                    Pilih template, e-book, atau starter kit dari katalog untuk memulai checkout otomatis.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {resolvedCart.map(({ product, quantity }) => {
                    const maxQty = product.unlimitedStock ? 20 : Math.max(1, product.stock);
                    return (
                      <div key={product.id} className="flex gap-4 py-4 first:pt-0">
                        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-900">
                          <SafeImage
                            src={product.coverImage}
                            alt={product.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                            {product.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                            {product.category} · {product.format}
                          </p>
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                              {formatIDR(product.price * quantity)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label="Kurangi jumlah"
                                onClick={() => onUpdateQuantity(product.id, quantity - 1)}
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-zinc-100">
                                {quantity}
                              </span>
                              <button
                                type="button"
                                aria-label="Tambah jumlah"
                                disabled={quantity >= maxQty}
                                onClick={() => onUpdateQuantity(product.id, Math.min(maxQty, quantity + 1))}
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                aria-label="Hapus item"
                                onClick={() => onRemoveItem(product.id)}
                                className="ml-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* STEP 2: CHECKOUT FORM */}
          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handleCreateOrder} className="space-y-5">
              <div className="space-y-3.5">
                <div>
                  <label
                    htmlFor="checkout-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                  >
                    Nama Lengkap
                  </label>
                  <input
                    id="checkout-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Dimas Wijaya"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="checkout-email"
                    className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                  >
                    Email Penerima File &amp; Lisensi
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="nama@domain.com"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="checkout-phone"
                    className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                  >
                    WhatsApp / Username Telegram
                  </label>
                  <input
                    id="checkout-phone"
                    type="text"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 dark:border-zinc-800">
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Pilih Metode Pembayaran Otomatis
                </p>
                <div className="mt-2.5 space-y-2">
                  {PAYMENT_OPTIONS.map((opt) => {
                    const selected = paymentMethod === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPaymentMethod(opt.id)}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-lg border px-3.5 py-3 text-left transition-colors ${
                          selected
                            ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/30'
                            : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/70'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                            {opt.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-zinc-400">{opt.subtitle}</p>
                        </div>
                        <CreditCard
                          className={`h-4 w-4 shrink-0 ${
                            selected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>
          )}

          {/* STEP 3: AUTOMATED PAYMENT VERIFICATION */}
          {step === 'payment' && activeOrder && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                  <QrCode className="h-8 w-8" aria-hidden="true" />
                </div>
                <p className="mt-3 text-xs font-medium text-slate-500 dark:text-zinc-400">
                  {formatPaymentMethodLabel(activeOrder.paymentMethod)}
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                  {formatIDR(activeOrder.totalAmount)}
                </p>
                <p className="mt-2 font-mono text-xs text-slate-600 dark:text-zinc-400">
                  Kode Referensi: {activeOrder.paymentReference}
                </p>
              </div>

              <div className="space-y-2 border-t border-slate-200 pt-4 text-sm dark:border-zinc-800">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Nomor Invoice</span>
                  <span className="font-mono font-medium text-slate-900 dark:text-zinc-100">
                    {activeOrder.invoiceCode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Pembeli</span>
                  <span className="font-medium text-slate-900 dark:text-zinc-100">
                    {activeOrder.customerName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Email</span>
                  <span className="text-slate-900 dark:text-zinc-100">{activeOrder.customerEmail}</span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                Selesaikan pembayaran melalui kanal yang dipilih, lalu tekan tombol konfirmasi di bawah untuk
                membuka tautan unduhan instan serta mengirim notifikasi pesanan ke Bot Telegram admin.
              </p>
            </div>
          )}

          {/* STEP 4: SUCCESS + INSTANT FILE DOWNLOADS */}
          {step === 'success' && activeOrder && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-display text-sm font-bold text-emerald-950 dark:text-emerald-100">
                      Pembayaran {activeOrder.invoiceCode} terverifikasi
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-emerald-800 dark:text-emerald-200">
                      Terima kasih, {activeOrder.customerName}. Semua file produk digital Anda sudah siap diunduh di bawah ini.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Tautan Unduhan Produk Digital
                </p>
                {activeOrder.items.map((item) => {
                  const downloadHref = `/api/orders/${encodeURIComponent(activeOrder.id)}/download/${encodeURIComponent(
                    item.productId,
                  )}?token=${encodeURIComponent(activeOrder.downloadToken)}`;
                  return (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                          {item.title}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-500 dark:text-zinc-400">
                          {item.fileName}
                        </p>
                      </div>
                      {isStaticMode ? (
                        <button
                          type="button"
                          onClick={() => triggerStaticLicenseDownload(activeOrder, item)}
                          style={{ backgroundColor: 'var(--store-accent)' }}
                          className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Unduh</span>
                        </button>
                      ) : (
                        <a
                          href={downloadHref}
                          download={item.fileName}
                          style={{ backgroundColor: 'var(--store-accent)' }}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Unduh</span>
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <Send className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">
                    Status Notifikasi Bot Telegram
                  </p>
                  <p className="mt-0.5">
                    {activeOrder.telegramMessage ||
                      (activeOrder.telegramStatus === 'sent'
                        ? 'Notifikasi pesanan terkirim real-time ke Telegram admin.'
                        : 'Pesanan tercatat di dasbor admin. Atur TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID di Secrets untuk pengiriman real-time.')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          {step === 'cart' && resolvedCart.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-zinc-400">Total Pembayaran</span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                  {formatIDR(subtotal)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep('checkout')}
                style={{
                  backgroundColor: 'var(--store-accent)',
                  borderRadius: 'var(--store-radius)',
                }}
                className="h-11 w-full cursor-pointer text-sm font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
              >
                Lanjut ke Pembayaran
              </button>
            </div>
          )}

          {step === 'checkout' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep('cart');
                }}
                className="h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Kembali
              </button>
              <button
                type="submit"
                form="checkout-form"
                disabled={submitting}
                style={{
                  backgroundColor: 'var(--store-accent)',
                  borderRadius: 'var(--store-radius)',
                }}
                className="h-11 flex-1 cursor-pointer text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
              >
                {submitting ? 'Memproses Pesanan...' : `Bayar ${formatIDR(subtotal)}`}
              </button>
            </div>
          )}

          {step === 'payment' && (
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmPayment}
              style={{
                backgroundColor: 'var(--store-accent)',
                borderRadius: 'var(--store-radius)',
              }}
              className="h-11 w-full cursor-pointer text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
            >
              {submitting ? 'Memverifikasi...' : 'Konfirmasi Pembayaran Otomatis'}
            </button>
          )}

          {step === 'success' && (
            <button
              type="button"
              onClick={handleClose}
              className="h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Kembali ke Katalog
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
