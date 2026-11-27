import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Landmark,
  Loader2,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CartItem,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentSettings,
  Product,
} from '../types/store';
import { formatIDR, formatPaymentMethodLabel, isSafeHttpOrLocalUrl } from '../lib/format';
import {
  createFirestoreOrder,
  submitFirestoreTransferProof,
  subscribeOrderStatus,
  syncFirestoreBankFromTelegram,
} from '../lib/firestoreStore';
import { triggerStaticLicenseDownload } from '../lib/staticFallback';
import { SafeImage } from './SafeImage';

interface CartCheckoutDrawerProps {
  open: boolean;
  serverlessAvailable?: boolean;
  storeName?: string;
  paymentSettings: PaymentSettings;
  items: CartItem[];
  products: Product[];
  onClose: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
}

type CheckoutStep = 'cart' | 'checkout' | 'payment' | 'success';

interface ActiveBuyerSession {
  order: Order;
  buyerSecret: string;
}

const ACTIVE_ORDER_SESSION_KEY = 'karsa_active_checkout_session_v2';

function saveActiveBuyerSession(session: ActiveBuyerSession | null): void {
  try {
    if (
      !session ||
      session.order.status === 'PAID' ||
      session.order.status === 'CANCELLED'
    ) {
      window.sessionStorage.removeItem(ACTIVE_ORDER_SESSION_KEY);
    } else {
      window.sessionStorage.setItem(ACTIVE_ORDER_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore session storage errors in private frames
  }
}

function loadActiveBuyerSession(): ActiveBuyerSession | null {
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_ORDER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveBuyerSession;
    if (
      parsed?.order?.id &&
      parsed?.order?.invoiceCode &&
      parsed?.buyerSecret &&
      (parsed.order.status === 'AWAITING_BANK' ||
        parsed.order.status === 'PENDING' ||
        parsed.order.status === 'PAYMENT_SUBMITTED')
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function CartCheckoutDrawer({
  open,
  serverlessAvailable = false,
  storeName = 'Karsa Digital',
  paymentSettings,
  items,
  products,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}: CartCheckoutDrawerProps) {
  const enabledMethods = paymentSettings.methods.filter((m) => m.enabled);
  const [step, setStep] = useState<CheckoutStep>('cart');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    enabledMethods[0]?.id ?? 'telegram_bank',
  );
  const [submitting, setSubmitting] = useState(false);
  const [pollingNow, setPollingNow] = useState(false);
  const [telegramNotConfigured, setTelegramNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyerSession, setBuyerSession] = useState<ActiveBuyerSession | null>(() =>
    loadActiveBuyerSession(),
  );
  const [gatewayPaymentUrl, setGatewayPaymentUrl] = useState<string | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedNominal, setCopiedNominal] = useState(false);
  const [transferProofNote, setTransferProofNote] = useState('');

  const activeOrder = buyerSession?.order ?? null;

  useEffect(() => {
    if (enabledMethods.length > 0 && !enabledMethods.some((m) => m.id === paymentMethod)) {
      setPaymentMethod(enabledMethods[0].id);
    }
  }, [enabledMethods, paymentMethod]);

  // Restore active awaiting/pending order when drawer opens (crucial on mobile browser reload)
  useEffect(() => {
    if (!open) return;
    if (
      activeOrder &&
      (activeOrder.status === 'AWAITING_BANK' ||
        activeOrder.status === 'PENDING' ||
        activeOrder.status === 'PAYMENT_SUBMITTED') &&
      step === 'cart' &&
      items.length === 0
    ) {
      setStep('payment');
    }
  }, [open, activeOrder, step, items.length]);

  // REAL-TIME FIRESTORE LISTENER on /orderStatuses/{orderId} (PII-free!)
  // Fires instantaneously whenever Admin sends bank details or verifies PAID from Admin Dashboard!
  useEffect(() => {
    if (!open || !buyerSession?.order?.id) return;
    const orderId = buyerSession.order.id;

    const unsubscribe = subscribeOrderStatus(orderId, (liveStatus) => {
      if (!liveStatus) return;

      setBuyerSession((prev) => {
        if (!prev || prev.order.id !== orderId) return prev;
        const merged: Order = {
          ...prev.order,
          status: liveStatus.status,
          adminBankName: liveStatus.adminBankName ?? prev.order.adminBankName,
          adminBankNumber: liveStatus.adminBankNumber ?? prev.order.adminBankNumber,
          adminBankHolder: liveStatus.adminBankHolder ?? prev.order.adminBankHolder,
          adminTransferAmount:
            liveStatus.adminTransferAmount ?? prev.order.adminTransferAmount,
          transferProofNote:
            liveStatus.transferProofNote ?? prev.order.transferProofNote,
          paidAt:
            liveStatus.status === 'PAID'
              ? prev.order.paidAt || liveStatus.updatedAt
              : prev.order.paidAt,
          telegramMessage:
            liveStatus.status === 'PAID'
              ? 'Pembayaran terverifikasi Lunas secara real-time oleh Admin.'
              : prev.order.telegramMessage,
        };
        const nextSession = { ...prev, order: merged };
        saveActiveBuyerSession(
          merged.status === 'PAID' || merged.status === 'CANCELLED' ? null : nextSession,
        );
        return nextSession;
      });

      if (liveStatus.status === 'PAID' && liveStatus.downloadReady) {
        setStep('success');
      }
    });

    return () => unsubscribe();
  }, [open, buyerSession?.order?.id]);

  // Secondary 3-second polling for two-way Telegram replies (when Admin replies directly inside Telegram chat)
  const pollTelegramOrderStatus = useCallback(
    async (session: ActiveBuyerSession, manual = false) => {
      if (manual) setPollingNow(true);
      try {
        if (!serverlessAvailable) {
          setTelegramNotConfigured(true);
          return;
        }

        const order = session.order;
        const params = new URLSearchParams({
          invoiceCode: order.invoiceCode,
        });
        if (order.telegramOrderMessageId) {
          params.set('orderMsgId', String(order.telegramOrderMessageId));
        }
        if (order.telegramTransferMessageId) {
          params.set('transferMsgId', String(order.telegramTransferMessageId));
        }

        const res = await fetch(`/api/telegram?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          configured?: boolean;
          stage?: 'AWAITING_BANK' | 'BANK_READY' | 'PAID' | 'CANCELLED';
          bank?: {
            bankName: string;
            accountNumber: string;
            accountHolder: string;
            amount: number;
          } | null;
        };

        setTelegramNotConfigured(data.configured === false);

        if (data.stage === 'CANCELLED') {
          const cancelledOrder: Order = { ...order, status: 'CANCELLED' };
          setBuyerSession({ ...session, order: cancelledOrder });
          saveActiveBuyerSession(null);
          return;
        }

        if (data.stage === 'PAID') {
          const paidOrder: Order = {
            ...order,
            status: 'PAID',
            paidAt: new Date().toISOString(),
            adminBankName: data.bank?.bankName ?? order.adminBankName,
            adminBankNumber: data.bank?.accountNumber ?? order.adminBankNumber,
            adminBankHolder: data.bank?.accountHolder ?? order.adminBankHolder,
            adminTransferAmount: data.bank?.amount ?? order.adminTransferAmount,
            telegramStatus: 'sent',
            telegramMessage: 'Pembayaran dikonfirmasi LUNAS oleh admin melalui Telegram.',
          };
          setBuyerSession({ ...session, order: paidOrder });
          saveActiveBuyerSession(null);
          setStep('success');
          return;
        }

        if (data.bank && order.status === 'AWAITING_BANK') {
          // Persist bank instructions atomically to Firestore using single-use buyerSecret capability proof
          await syncFirestoreBankFromTelegram(order.id, session.buyerSecret, data.bank).catch(
            () => {
              // If already updated by Admin Dashboard, Firestore onSnapshot handles state
            },
          );
          const updatedOrder: Order = {
            ...order,
            status: 'PENDING',
            adminBankName: data.bank.bankName,
            adminBankNumber: data.bank.accountNumber,
            adminBankHolder: data.bank.accountHolder,
            adminTransferAmount: data.bank.amount,
          };
          const nextSession = { ...session, order: updatedOrder };
          setBuyerSession(nextSession);
          saveActiveBuyerSession(nextSession);
        }
      } catch {
        // Ignore transient network errors during background poll
      } finally {
        if (manual) setPollingNow(false);
      }
    },
    [serverlessAvailable],
  );

  useEffect(() => {
    if (
      !open ||
      step !== 'payment' ||
      !buyerSession ||
      buyerSession.order.paymentMethod !== 'telegram_bank' ||
      buyerSession.order.status === 'PAID' ||
      buyerSession.order.status === 'CANCELLED'
    ) {
      return;
    }

    void pollTelegramOrderStatus(buyerSession);
    const interval = window.setInterval(() => {
      void pollTelegramOrderStatus(buyerSession);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [open, step, buyerSession, pollTelegramOrderStatus]);

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
    if (step === 'success' || activeOrder?.status === 'CANCELLED') {
      setStep('cart');
      setBuyerSession(null);
      saveActiveBuyerSession(null);
      setGatewayPaymentUrl(null);
    }
    onClose();
  };

  const handleAbandonWaitingOrder = () => {
    setError(null);
    setBuyerSession(null);
    saveActiveBuyerSession(null);
    setStep('cart');
  };

  const notifyServerlessTelegram = async (
    payload: {
      event: 'order_created' | 'transfer_submitted';
      invoiceCode: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      paymentMethod: PaymentMethod;
      paymentReference: string;
      totalAmount: number;
      items: OrderItem[];
      adminBankName?: string;
      adminBankNumber?: string;
      adminBankHolder?: string;
      adminTransferAmount?: number;
      transferProofNote?: string;
    },
  ): Promise<{
    detail?: string;
    status: Order['telegramStatus'];
    messageId?: number;
  }> => {
    if (!serverlessAvailable) {
      return { status: 'not_configured', detail: 'Endpoint Telegram tidak aktif di hosting statis murni.' };
    }
    try {
      const tgRes = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          storeName,
        }),
      });
      const tgData = (await tgRes.json().catch(() => null)) as
        | {
            status?: 'sent' | 'not_configured' | 'failed';
            detail?: string;
            messageId?: number | null;
          }
        | null;
      return {
        status: tgData?.status || 'failed',
        detail: tgData?.detail,
        messageId: typeof tgData?.messageId === 'number' ? tgData.messageId : undefined,
      };
    } catch {
      return { status: 'failed', detail: 'Gagal menghubungi endpoint Bot Telegram.' };
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGatewayPaymentUrl(null);
    setTelegramNotConfigured(false);

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
    if (resolvedCart.length === 0) {
      setError('Keranjang belanja kosong.');
      return;
    }

    setSubmitting(true);
    try {
      const orderItems: OrderItem[] = resolvedCart.map((entry) => ({
        productId: entry.product.id,
        title: entry.product.title,
        price: entry.product.price,
        quantity: entry.quantity,
        fileName: entry.product.fileName,
      }));

      // Step 1: Notify Telegram first (if serverless/Express available) so messageId is stored atomically on create
      const tempInvoicePreview = `INV-${new Date().getFullYear()}-${String(
        Math.floor(1000 + Math.random() * 9000),
      )}`;
      const tempPaymentRef = `${paymentMethod.toUpperCase()}-${Math.floor(
        10000000 + Math.random() * 89999999,
      )}`;

      let telegramMeta: {
        status: Order['telegramStatus'];
        detail?: string;
        messageId?: number;
      } = { status: 'pending' };

      if (serverlessAvailable) {
        telegramMeta = await notifyServerlessTelegram({
          event: 'order_created',
          invoiceCode: tempInvoicePreview,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          paymentMethod,
          paymentReference: tempPaymentRef,
          totalAmount: subtotal,
          items: orderItems,
        });
        if (telegramMeta.status === 'not_configured') {
          setTelegramNotConfigured(true);
        }
      } else if (paymentMethod === 'telegram_bank') {
        setTelegramNotConfigured(true);
        telegramMeta = {
          status: 'not_configured',
          detail: 'Menunggu konfirmasi Admin dari Dasbor Admin (Real-Time Cloud).',
        };
      }

      // Step 2: Persist order + PII-free orderStatus atomically in Firebase Firestore
      const created = await createFirestoreOrder({
        invoiceCode: tempInvoicePreview,
        paymentReference: tempPaymentRef,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        paymentMethod,
        items: orderItems,
        totalAmount: subtotal,
        telegramMeta,
      });

      // Step 3: Optional payment gateway redirect link (Midtrans) for non-Telegram methods
      if (serverlessAvailable && paymentMethod !== 'telegram_bank') {
        try {
          const payRes = await fetch('/api/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoiceCode: created.order.invoiceCode,
              totalAmount: created.order.totalAmount,
              customerName: created.order.customerName,
              customerEmail: created.order.customerEmail,
              customerPhone: created.order.customerPhone,
              paymentMethod: created.order.paymentMethod,
            }),
          });
          const payData = (await payRes.json().catch(() => null)) as
            | { paymentUrl?: string | null }
            | null;
          if (payRes.ok && payData?.paymentUrl && isSafeHttpOrLocalUrl(payData.paymentUrl)) {
            setGatewayPaymentUrl(payData.paymentUrl);
          }
        } catch {
          // Continue with built-in transfer details
        }
      }

      setBuyerSession(created);
      saveActiveBuyerSession(created);
      onClearCart();
      setStep('payment');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses pesanan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitTransfer = async () => {
    if (!buyerSession) return;
    setError(null);
    setSubmitting(true);
    const cleanedProof = transferProofNote.trim().slice(0, 200);
    const order = buyerSession.order;

    try {
      const tgRes = await notifyServerlessTelegram({
        event: 'transfer_submitted',
        invoiceCode: order.invoiceCode,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        paymentMethod: order.paymentMethod,
        paymentReference: order.paymentReference,
        totalAmount: order.totalAmount,
        items: order.items,
        adminBankName: order.adminBankName,
        adminBankNumber: order.adminBankNumber,
        adminBankHolder: order.adminBankHolder,
        adminTransferAmount: order.adminTransferAmount,
        transferProofNote: cleanedProof || order.transferProofNote,
      });

      await submitFirestoreTransferProof(
        order.id,
        buyerSession.buyerSecret,
        cleanedProof || order.transferProofNote || 'Pembeli menekan konfirmasi sudah transfer',
        {
          status: tgRes.status,
          detail: tgRes.detail,
          messageId: tgRes.messageId,
        },
      );

      const updated: Order = {
        ...order,
        status: 'PAYMENT_SUBMITTED',
        transferProofNote: cleanedProof || order.transferProofNote,
        telegramStatus: tgRes.status,
        telegramMessage: tgRes.detail || order.telegramMessage,
        telegramTransferMessageId: tgRes.messageId || order.telegramTransferMessageId,
      };
      const nextSession = { ...buyerSession, order: updated };
      setBuyerSession(nextSession);
      saveActiveBuyerSession(nextSession);
      setTransferProofNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim konfirmasi transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  const isTelegramFlow = activeOrder?.paymentMethod === 'telegram_bank';

  const getHeaderTitle = () => {
    if (step === 'cart') return 'Keranjang Belanja';
    if (step === 'checkout') return 'Data Pembeli & Checkout';
    if (step === 'success') return 'Pembayaran Lunas';
    if (isTelegramFlow && activeOrder?.status === 'AWAITING_BANK') {
      return 'Menunggu Rekening Admin';
    }
    if (activeOrder?.status === 'PAYMENT_SUBMITTED') {
      return 'Menunggu Verifikasi Admin';
    }
    if (activeOrder?.status === 'CANCELLED') {
      return 'Pesanan Dibatalkan';
    }
    return 'Detail Pembayaran';
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
              {getHeaderTitle()}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {step === 'cart' && `${resolvedCart.length} produk dipilih`}
              {step === 'checkout' && 'Detail rekening & status pesanan tersinkronisasi real-time'}
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

          {/* Resume active order banner */}
          {step === 'cart' &&
            activeOrder &&
            (activeOrder.status === 'AWAITING_BANK' ||
              activeOrder.status === 'PENDING' ||
              activeOrder.status === 'PAYMENT_SUBMITTED') && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs dark:border-blue-900/60 dark:bg-blue-950/30">
                <p className="font-semibold text-blue-950 dark:text-blue-100">
                  Pesanan aktif: {activeOrder.invoiceCode}
                </p>
                <p className="mt-0.5 text-blue-800 dark:text-blue-200">
                  {activeOrder.status === 'AWAITING_BANK'
                    ? 'Sedang menunggu detail rekening dari Admin.'
                    : activeOrder.status === 'PENDING'
                      ? 'Detail rekening & nominal siap ditransfer.'
                      : 'Menunggu verifikasi mutasi dari Admin (otomatis terbuka saat Lunas).'}
                </p>
                <button
                  type="button"
                  onClick={() => setStep('payment')}
                  style={{ backgroundColor: 'var(--store-accent)' }}
                  className="mt-2.5 inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-xs font-semibold text-white hover:opacity-90"
                >
                  Lanjutkan Pesanan Ini
                </button>
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
                    Pilih produk digital dari katalog untuk melanjutkan proses checkout.
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
                  Metode Pembayaran
                </p>
                <div className="mt-2.5 space-y-2">
                  {enabledMethods.map((opt) => {
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
                        <div className="pr-3">
                          <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                            {opt.label}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-zinc-400">
                            {opt.description}
                          </p>
                        </div>
                        {opt.id === 'telegram_bank' || opt.id === 'bank_transfer' ? (
                          <Landmark
                            className={`h-4 w-4 shrink-0 ${
                              selected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                        ) : (
                          <CreditCard
                            className={`h-4 w-4 shrink-0 ${
                              selected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {paymentMethod === 'telegram_bank' && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                    <p className="font-semibold text-slate-900 dark:text-zinc-100">
                      Cara kerja pembayaran:
                    </p>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                      <li>Pesanan Anda langsung tercatat real-time di Dasbor Admin &amp; Bot Telegram.</li>
                      <li>
                        Admin mengirim <strong>Nama Bank</strong>, <strong>Nomor Rekening</strong>, dan{' '}
                        <strong>Nominal</strong> langsung ke layar checkout ini secara instan.
                      </li>
                      <li>Setelah Anda transfer dan Admin memverifikasi, tautan unduhan langsung terbuka otomatis.</li>
                    </ol>
                  </div>
                )}
              </div>
            </form>
          )}

          {/* STEP 3: TELEGRAM TWO-WAY BANK CONFIRMATION FLOW */}
          {step === 'payment' && activeOrder && isTelegramFlow && (
            <div className="space-y-5">
              {/* Sub-stage A: AWAITING_BANK */}
              {activeOrder.status === 'AWAITING_BANK' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-400">
                    <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
                  </div>

                  <h3 className="mt-4 font-display text-base font-bold text-slate-900 dark:text-zinc-50">
                    Menunggu Konfirmasi Rekening dari Admin
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                    Pesanan <span className="font-mono font-semibold text-slate-900 dark:text-zinc-100">{activeOrder.invoiceCode}</span>{' '}
                    sudah diterima secara real-time oleh Admin. Layar ini akan otomatis menampilkan{' '}
                    <strong>Nama Bank</strong>, <strong>Nomor Rekening</strong>, dan{' '}
                    <strong>Nominal</strong> begitu Admin mengirimnya dari Dasbor atau Telegram.
                  </p>

                  {serverlessAvailable && (
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={pollingNow}
                        onClick={() => buyerSession && void pollTelegramOrderStatus(buyerSession, true)}
                        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${pollingNow ? 'animate-spin' : ''}`} />
                        <span>{pollingNow ? 'Memeriksa...' : 'Periksa Balasan Telegram'}</span>
                      </button>
                    </div>
                  )}

                  <p className="mt-3 text-[11px] text-slate-400 dark:text-zinc-500">
                    Terhubung secara real-time — layar akan langsung berubah otomatis tanpa reload.
                  </p>
                </div>
              )}

              {/* Sub-stage B: PENDING (Bank Details Received!) */}
              {activeOrder.status === 'PENDING' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>Detail Rekening Diterima dari Admin</span>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                      Bank Tujuan Transfer
                    </p>
                    <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
                      {activeOrder.adminBankName || 'Transfer Bank'}
                    </p>
                    {activeOrder.adminBankHolder && (
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">
                        a.n. {activeOrder.adminBankHolder}
                      </p>
                    )}

                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm font-bold tracking-wide text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
                        {activeOrder.adminBankNumber || '-'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeOrder.adminBankNumber) return;
                          navigator.clipboard?.writeText(activeOrder.adminBankNumber);
                          setCopiedAccount(true);
                          setTimeout(() => setCopiedAccount(false), 1800);
                        }}
                        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {copiedAccount ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Disalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="mt-4 border-t border-slate-200 pt-4 dark:border-zinc-800">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                        Nominal Transfer
                      </p>
                      <div className="mt-1 flex items-center justify-center gap-2">
                        <p className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                          {formatIDR(activeOrder.adminTransferAmount ?? activeOrder.totalAmount)}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const rawAmount = String(
                              activeOrder.adminTransferAmount ?? activeOrder.totalAmount,
                            );
                            navigator.clipboard?.writeText(rawAmount);
                            setCopiedNominal(true);
                            setTimeout(() => setCopiedNominal(false), 1800);
                          }}
                          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {copiedNominal ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>Disalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Salin</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-left">
                    <label
                      htmlFor="transfer-proof-note"
                      className="block text-[11px] font-semibold text-emerald-950 dark:text-emerald-100"
                    >
                      Catatan / Nomor Referensi Bukti Transfer (Opsional)
                    </label>
                    <input
                      id="transfer-proof-note"
                      type="text"
                      maxLength={200}
                      value={transferProofNote}
                      onChange={(e) => setTransferProofNote(e.target.value)}
                      placeholder="Mis. Transfer dari BCA a.n. Budi jam 14:20"
                      className="mt-1 h-9 w-full rounded-lg border border-emerald-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-emerald-900/60 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                </div>
              )}

              {/* Sub-stage C: PAYMENT_SUBMITTED */}
              {activeOrder.status === 'PAYMENT_SUBMITTED' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-6 text-center dark:border-blue-900/60 dark:bg-blue-950/30">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-600 dark:border-blue-900 dark:bg-zinc-950 dark:text-blue-400">
                    <Clock className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-slate-900 dark:text-zinc-50">
                    Konfirmasi Transfer Terkirim
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-zinc-300">
                    Admin sedang memverifikasi mutasi Anda. Begitu Admin menekan <strong>Verifikasi Lunas</strong> di Dasbor atau membalas <strong>LUNAS</strong> di Telegram, tautan unduhan akan langsung terbuka otomatis di layar ini.
                  </p>
                  {activeOrder.transferProofNote && (
                    <p className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      Catatan Anda: {activeOrder.transferProofNote}
                    </p>
                  )}
                </div>
              )}

              {/* Sub-stage D: CANCELLED */}
              {activeOrder.status === 'CANCELLED' && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900/60 dark:bg-red-950/40">
                  <AlertCircle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
                  <h3 className="mt-3 font-display text-base font-bold text-red-900 dark:text-red-100">
                    Pesanan Dibatalkan Admin
                  </h3>
                  <p className="mt-1 text-xs text-red-800 dark:text-red-200">
                    Pesanan {activeOrder.invoiceCode} dibatalkan oleh Admin. Silakan buat pesanan ulang atau hubungi admin.
                  </p>
                </div>
              )}

              {/* Notice if Telegram bot secrets aren't configured yet */}
              {telegramNotConfigured && activeOrder.status !== 'CANCELLED' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="font-semibold">Sinkronisasi Dasbor Real-Time Aktif</p>
                  <p className="mt-1">
                    Pesanan sudah masuk ke Dasbor Admin secara real-time. Untuk notifikasi via Telegram juga, pastikan{' '}
                    <span className="font-mono">TELEGRAM_BOT_TOKEN</span> dan{' '}
                    <span className="font-mono">TELEGRAM_CHAT_ID</span> terpasang di Vercel Environment Variables.
                  </p>
                </div>
              )}

              {/* Order Summary */}
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
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-zinc-400">Estimasi Pesanan</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                    {formatIDR(activeOrder.adminTransferAmount ?? activeOrder.totalAmount)}
                  </span>
                </div>
              </div>

              {activeOrder.status !== 'CANCELLED' && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleAbandonWaitingOrder}
                    className="cursor-pointer text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:text-zinc-500 dark:hover:text-zinc-300"
                  >
                    Batalkan tampilan ini &amp; kembali ke keranjang
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3B: REGULAR PAYMENT METHODS (STATIC BANK / QRIS / VA) */}
          {step === 'payment' && activeOrder && !isTelegramFlow && (() => {
            const methodCfg = paymentSettings.methods.find((m) => m.id === activeOrder.paymentMethod);
            const accountNumber =
              activeOrder.paymentMethod === 'qris'
                ? paymentSettings.qrisMerchantId || methodCfg?.accountNumber || activeOrder.paymentReference
                : methodCfg?.accountNumber || activeOrder.paymentReference;
            const accountHolder = methodCfg?.accountHolder || paymentSettings.merchantName;

            return (
              <div className="space-y-5">
                {activeOrder.status === 'PAYMENT_SUBMITTED' ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-6 text-center dark:border-blue-900/60 dark:bg-blue-950/30">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-600 dark:border-blue-900 dark:bg-zinc-950 dark:text-blue-400">
                      <Clock className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 font-display text-base font-bold text-slate-900 dark:text-zinc-50">
                      Bukti Transfer Terkirim — Menunggu Verifikasi
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-zinc-300">
                      Pesanan <span className="font-mono font-semibold">{activeOrder.invoiceCode}</span> sedang diperiksa oleh Admin. Layar ini akan otomatis membuka tautan unduhan secara real-time begitu Admin memverifikasi.
                    </p>
                  </div>
                ) : activeOrder.status === 'CANCELLED' ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-900/60 dark:bg-red-950/40">
                    <AlertCircle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
                    <h3 className="mt-3 font-display text-base font-bold text-red-900 dark:text-red-100">
                      Pesanan Dibatalkan Admin
                    </h3>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-zinc-800 dark:bg-zinc-900">
                    {activeOrder.paymentMethod === 'qris' &&
                    paymentSettings.qrisImageUrl &&
                    isSafeHttpOrLocalUrl(paymentSettings.qrisImageUrl) ? (
                      <div className="mx-auto mb-3 h-44 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 dark:border-zinc-700">
                        <SafeImage
                          src={paymentSettings.qrisImageUrl}
                          alt={`QRIS ${paymentSettings.merchantName}`}
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                        {activeOrder.paymentMethod === 'bank_transfer' ? (
                          <Landmark className="h-7 w-7" aria-hidden="true" />
                        ) : (
                          <QrCode className="h-8 w-8" aria-hidden="true" />
                        )}
                      </div>
                    )}

                    <p className="mt-3 text-xs font-medium text-slate-500 dark:text-zinc-400">
                      {methodCfg?.label || formatPaymentMethodLabel(activeOrder.paymentMethod)} · {accountHolder}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                      {formatIDR(activeOrder.totalAmount)}
                    </p>

                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                        {accountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(accountNumber);
                          setCopiedAccount(true);
                          setTimeout(() => setCopiedAccount(false), 1800);
                        }}
                        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {copiedAccount ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span>Disalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>

                    {gatewayPaymentUrl && (
                      <a
                        href={gatewayPaymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ backgroundColor: 'var(--store-accent)' }}
                        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white hover:opacity-90"
                      >
                        <span>Buka Halaman Pembayaran Gateway</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}

                    <div className="mt-4 text-left">
                      <label
                        htmlFor="regular-transfer-proof"
                        className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300"
                      >
                        Catatan / Nomor Referensi Bukti Transfer (Opsional)
                      </label>
                      <input
                        id="regular-transfer-proof"
                        type="text"
                        maxLength={200}
                        value={transferProofNote}
                        onChange={(e) => setTransferProofNote(e.target.value)}
                        placeholder="Mis. Transfer dari BCA a.n. Budi jam 14:20"
                        className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2 border-t border-slate-200 pt-4 text-sm dark:border-zinc-800">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-zinc-400">Nomor Invoice</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-zinc-100">
                      {activeOrder.invoiceCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-zinc-400">Batas Waktu</span>
                    <span className="font-mono text-slate-900 dark:text-zinc-100">
                      {paymentSettings.expiryMinutes} menit
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
              </div>
            );
          })()}

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
                {activeOrder.items.map((item) => (
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
                    <button
                      type="button"
                      onClick={() => triggerStaticLicenseDownload(activeOrder, item)}
                      style={{ backgroundColor: 'var(--store-accent)' }}
                      className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Unduh</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <Send className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-zinc-100">
                    Status Konfirmasi
                  </p>
                  <p className="mt-0.5">
                    {activeOrder.telegramMessage ||
                      'Pembayaran terverifikasi real-time oleh Admin.'}
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
                Lanjut ke Checkout
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
                {submitting
                  ? 'Membuat Pesanan...'
                  : paymentMethod === 'telegram_bank'
                    ? 'Kirim Pesanan & Minta Rekening'
                    : `Buat Pesanan ${formatIDR(subtotal)}`}
              </button>
            </div>
          )}

          {/* Footer for Payment Step (both Telegram & Regular Bank/QRIS/VA) */}
          {step === 'payment' && activeOrder && (
            <>
              {activeOrder.status === 'AWAITING_BANK' && (
                <button
                  type="button"
                  disabled={pollingNow}
                  onClick={() => buyerSession && void pollTelegramOrderStatus(buyerSession, true)}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <RefreshCw className={`h-4 w-4 ${pollingNow ? 'animate-spin' : ''}`} />
                  <span>{pollingNow ? 'Memeriksa...' : 'Menunggu Rekening dari Admin'}</span>
                </button>
              )}

              {activeOrder.status === 'PENDING' && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitTransfer}
                  style={{
                    backgroundColor: 'var(--store-accent)',
                    borderRadius: 'var(--store-radius)',
                  }}
                  className="h-11 w-full cursor-pointer text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                >
                  {submitting ? 'Mengirim Konfirmasi...' : 'Saya Sudah Transfer'}
                </button>
              )}

              {activeOrder.status === 'PAYMENT_SUBMITTED' && (
                <button
                  type="button"
                  disabled={pollingNow}
                  onClick={() => buyerSession && void pollTelegramOrderStatus(buyerSession, true)}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60"
                >
                  <RefreshCw className={`h-4 w-4 ${pollingNow ? 'animate-spin' : ''}`} />
                  <span>{pollingNow ? 'Memeriksa Konfirmasi...' : 'Menunggu Konfirmasi Lunas Admin'}</span>
                </button>
              )}

              {activeOrder.status === 'CANCELLED' && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Kembali ke Katalog
                </button>
              )}
            </>
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
