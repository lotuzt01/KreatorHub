import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  Globe,
  LogOut,
  Minus,
  Moon,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Sun,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { AdminOverviewPayload, Order, Product } from '../types/store';
import {
  formatDateTimeID,
  formatIDR,
  formatPaymentMethodLabel,
} from '../lib/format';
import {
  deleteStaticProduct,
  getStaticAdminOverview,
  saveStaticProduct,
  updateStaticOrderStatus,
} from '../lib/staticFallback';
import { ProductEditorModal } from './ProductEditorModal';
import { ThemeEditorPanel } from './ThemeEditorPanel';
import { PaymentSettingsPanel } from './PaymentSettingsPanel';
import { DeploySeoPanel, TelegramSettingsPanel } from './TelegramDeployPanels';
import { SafeImage } from './SafeImage';

export interface ServerlessHealthInfo {
  ok: boolean;
  runtime: string;
  telegramBotConfigured: boolean;
  telegramChatConfigured: boolean;
  midtransConfigured: boolean;
  webhookSecretConfigured: boolean;
  paymentMode: 'production' | 'sandbox';
}

type AdminTab = 'orders' | 'products' | 'payment' | 'theme' | 'telegram' | 'deploy';

interface AdminDashboardProps {
  adminToken: string;
  isStaticMode?: boolean;
  serverlessHealth?: ServerlessHealthInfo | null;
  isDark: boolean;
  onToggleTheme: () => void;
  onExitAdmin: () => void;
  onLogout: () => void;
  onStorefrontChanged: () => void;
}

const TAB_ITEMS: Array<{ id: AdminTab; label: string; icon: typeof ShoppingCart }> = [
  { id: 'orders', label: 'Ringkasan & Pesanan', icon: ShoppingCart },
  { id: 'products', label: 'Produk & Stok', icon: Package },
  { id: 'payment', label: 'Pembayaran', icon: CreditCard },
  { id: 'theme', label: 'Editor Tampilan', icon: Palette },
  { id: 'telegram', label: 'Bot Telegram', icon: Send },
  { id: 'deploy', label: 'Deploy & SEO', icon: Globe },
];

export function AdminDashboard({
  adminToken,
  isStaticMode = false,
  serverlessHealth = null,
  isDark,
  onToggleTheme,
  onExitAdmin,
  onLogout,
  onStorefrontChanged,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('orders');
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'PAID' | 'PENDING' | 'CANCELLED'>('ALL');
  const [productSearch, setProductSearch] = useState('');

  // Product editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    if (isStaticMode) {
      setOverview(getStaticAdminOverview(serverlessHealth ?? undefined));
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      const data = (await res.json()) as AdminOverviewPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal memuat dasbor admin.');
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [adminToken, isStaticMode, serverlessHealth, onLogout]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleRefreshAll = async () => {
    await fetchOverview();
    onStorefrontChanged();
  };

  const handleAdjustStock = async (product: Product, delta: number) => {
    if (product.unlimitedStock) return;
    const nextStock = Math.max(0, product.stock + delta);
    setBusyActionId(product.id);
    try {
      if (isStaticMode) {
        saveStaticProduct(product.id, { stock: nextStock });
        await handleRefreshAll();
        return;
      }
      const res = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ stock: nextStock }),
      });
      if (res.ok) {
        await handleRefreshAll();
      }
    } finally {
      setBusyActionId(null);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    setBusyActionId(product.id);
    try {
      if (isStaticMode) {
        deleteStaticProduct(product.id);
        await handleRefreshAll();
        return;
      }
      const res = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        await handleRefreshAll();
      }
    } finally {
      setBusyActionId(null);
    }
  };

  const handleUpdateOrderStatus = async (order: Order, nextStatus: Order['status']) => {
    setBusyActionId(order.id);
    try {
      if (isStaticMode) {
        updateStaticOrderStatus(order.id, nextStatus);
        await handleRefreshAll();
        return;
      }
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await handleRefreshAll();
      }
    } finally {
      setBusyActionId(null);
    }
  };

  const handleResendTelegram = async (order: Order) => {
    if (isStaticMode) return;
    setBusyActionId(`tg-${order.id}`);
    try {
      const res = await fetch(
        `/api/admin/orders/${encodeURIComponent(order.id)}/resend-telegram`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );
      if (res.ok) {
        await fetchOverview();
      }
    } finally {
      setBusyActionId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!overview) return [];
    const q = orderSearch.trim().toLowerCase();
    return overview.orders.filter((o) => {
      const matchStatus = orderFilter === 'ALL' || o.status === orderFilter;
      const matchQuery =
        !q ||
        o.invoiceCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerEmail.toLowerCase().includes(q);
      return matchStatus && matchQuery;
    });
  }, [overview, orderSearch, orderFilter]);

  const filteredProducts = useMemo(() => {
    if (!overview) return [];
    const q = productSearch.trim().toLowerCase();
    return overview.products.filter(
      (p) =>
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.format.toLowerCase().includes(q),
    );
  }, [overview, productSearch]);

  const activeTabLabel = TAB_ITEMS.find((t) => t.id === activeTab)?.label ?? 'Dasbor';

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-zinc-800">
          <span className="truncate font-display text-base font-bold text-slate-900 dark:text-zinc-50">
            {overview?.settings.theme.storeName || 'Karsa Digital'}
          </span>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Menu Dasbor Admin">
          {TAB_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-1.5 border-t border-slate-200 p-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{isDark ? 'Mode Terang' : 'Mode Gelap'}</span>
          </button>
          <button
            type="button"
            onClick={onExitAdmin}
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Lihat Toko Utama</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogOut className="h-4 w-4" />
            <span>Keluar Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Contextual Top Bar with Breadcrumbs */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8 dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="text-slate-500 dark:text-zinc-400">Admin</span>
            <span className="text-slate-300 dark:text-zinc-700">/</span>
            <span className="truncate font-display font-semibold text-slate-900 dark:text-zinc-50">
              {activeTabLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleRefreshAll}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Muat Ulang</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setEditorOpen(true);
              }}
              style={{ backgroundColor: 'var(--store-accent)' }}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tambah Produk</span>
            </button>
          </div>
        </header>

        {/* Mobile Tab Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`h-8 cursor-pointer rounded-lg px-3 text-xs font-semibold whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onExitAdmin}
            className="ml-auto h-8 cursor-pointer rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0 dark:border-zinc-700 dark:text-zinc-300"
          >
            Toko
          </button>
        </div>

        {/* Viewport Body */}
        <main className="mx-auto w-full max-w-[1240px] flex-1 p-4 sm:p-6 lg:p-8">
          {loading || !overview ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  />
                ))}
              </div>
              <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : (
            <>
              {/* TAB 1: ORDERS & METRICS */}
              {activeTab === 'orders' && (
                <div className="space-y-6">
                  {/* Flat 4-Col KPI Strip */}
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">Total Pendapatan</p>
                      <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                        {formatIDR(overview.metrics.totalRevenue)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">Pesanan Lunas</p>
                      <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                        {overview.metrics.paidOrdersCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">Produk Aktif</p>
                      <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-900 dark:text-zinc-50">
                        {overview.metrics.activeProductsCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                      <p className="text-xs text-slate-500 dark:text-zinc-400">Stok Menipis</p>
                      <p
                        className={`mt-2 font-mono text-xl font-bold tabular-nums ${
                          overview.metrics.lowStockProductsCount > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-900 dark:text-zinc-50'
                        }`}
                      >
                        {overview.metrics.lowStockProductsCount}
                      </p>
                    </div>
                  </div>

                  {/* Orders Table Container */}
                  <div className="rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
                      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-zinc-950">
                        {(['ALL', 'PAID', 'PENDING', 'CANCELLED'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setOrderFilter(st)}
                            className={`h-7 cursor-pointer rounded px-2.5 text-xs font-semibold whitespace-nowrap ${
                              orderFilter === st
                                ? 'bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white'
                                : 'text-slate-600 dark:text-zinc-400'
                            }`}
                          >
                            {st === 'ALL'
                              ? 'Semua'
                              : st === 'PAID'
                                ? 'Lunas'
                                : st === 'PENDING'
                                  ? 'Menunggu'
                                  : 'Batal'}
                          </button>
                        ))}
                      </div>

                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={orderSearch}
                          onChange={(e) => setOrderSearch(e.target.value)}
                          placeholder="Cari invoice atau pembeli..."
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 sm:w-64 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </div>
                    </div>

                    {filteredOrders.length === 0 ? (
                      <div className="py-12 text-center text-sm text-slate-500 dark:text-zinc-400">
                        Belum ada pesanan yang sesuai filter.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Invoice &amp; Waktu</th>
                              <th className="px-4 py-3 font-semibold">Pembeli</th>
                              <th className="px-4 py-3 font-semibold">Produk</th>
                              <th className="px-4 py-3 text-right font-semibold">Total</th>
                              <th className="px-4 py-3 font-semibold">Status</th>
                              <th className="px-4 py-3 font-semibold">Telegram</th>
                              <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                            {filteredOrders.map((order) => (
                              <tr
                                key={order.id}
                                className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40"
                              >
                                <td className="px-4 py-3.5 align-top">
                                  <p className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
                                    {order.invoiceCode}
                                  </p>
                                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">
                                    {formatDateTimeID(order.createdAt)}
                                  </p>
                                </td>
                                <td className="px-4 py-3.5 align-top">
                                  <p className="font-medium text-slate-900 dark:text-zinc-100">
                                    {order.customerName}
                                  </p>
                                  <p className="mt-0.5 text-slate-500 dark:text-zinc-400">
                                    {order.customerEmail}
                                  </p>
                                </td>
                                <td className="max-w-[220px] px-4 py-3.5 align-top">
                                  {order.items.map((item) => (
                                    <p
                                      key={item.productId}
                                      className="truncate text-slate-700 dark:text-zinc-200"
                                    >
                                      {item.quantity}x {item.title}
                                    </p>
                                  ))}
                                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
                                    {formatPaymentMethodLabel(order.paymentMethod)}
                                  </p>
                                </td>
                                <td className="px-4 py-3.5 text-right align-top font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                                  {formatIDR(order.totalAmount)}
                                </td>
                                <td className="px-4 py-3.5 align-top">
                                  <span
                                    className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap ${
                                      order.status === 'PAID'
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : order.status === 'PENDING'
                                          ? 'text-amber-700 dark:text-amber-400'
                                          : 'text-red-700 dark:text-red-400'
                                    }`}
                                  >
                                    {order.status === 'PAID' && <CheckCircle2 className="h-3.5 w-3.5" />}
                                    {order.status === 'PENDING' && <Clock className="h-3.5 w-3.5" />}
                                    {order.status === 'CANCELLED' && <XCircle className="h-3.5 w-3.5" />}
                                    <span>
                                      {order.status === 'PAID'
                                        ? 'Lunas'
                                        : order.status === 'PENDING'
                                          ? 'Menunggu'
                                          : 'Dibatalkan'}
                                    </span>
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 align-top text-slate-600 dark:text-zinc-400">
                                  {order.telegramStatus === 'sent' && 'Terkirim'}
                                  {order.telegramStatus === 'not_configured' && 'Belum diatur'}
                                  {order.telegramStatus === 'failed' && 'Gagal kirim'}
                                  {order.telegramStatus === 'pending' && 'Menunggu'}
                                </td>
                                <td className="px-4 py-3.5 text-right align-top">
                                  <div className="inline-flex items-center gap-1.5">
                                    {order.status === 'PENDING' && (
                                      <button
                                        type="button"
                                        disabled={busyActionId === order.id}
                                        onClick={() => handleUpdateOrderStatus(order, 'PAID')}
                                        className="h-7 cursor-pointer rounded border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 whitespace-nowrap dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
                                      >
                                        Tandai Lunas
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      disabled={busyActionId === `tg-${order.id}`}
                                      onClick={() => handleResendTelegram(order)}
                                      className="h-7 cursor-pointer rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                    >
                                      Kirim Notif
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: PRODUCTS & STOCK MANAGEMENT */}
              {activeTab === 'products' && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900 dark:text-zinc-50">
                        Katalog Produk &amp; Manajemen Stok
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                        Unggah file produk, atur harga, kategori, atau ubah jumlah stok langsung dari tabel.
                      </p>
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Cari produk atau kategori..."
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-xs text-slate-900 sm:w-64 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Produk</th>
                            <th className="px-4 py-3 font-semibold">Kategori &amp; File</th>
                            <th className="px-4 py-3 text-right font-semibold">Harga</th>
                            <th className="px-4 py-3 font-semibold">Stok</th>
                            <th className="px-4 py-3 text-right font-semibold">Terjual</th>
                            <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                          {filteredProducts.map((product) => (
                            <tr
                              key={product.id}
                              className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40"
                            >
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="h-11 w-14 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950">
                                    <SafeImage
                                      src={product.coverImage}
                                      alt={product.title}
                                      className="h-full w-full object-cover"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="max-w-[260px] truncate font-semibold text-slate-900 dark:text-zinc-100">
                                      {product.title}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
                                      {product.status === 'active' ? 'Aktif' : 'Draft'}
                                      {product.featured ? ' · Unggulan' : ''}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                <p className="font-medium text-slate-800 dark:text-zinc-200">
                                  {product.category}
                                </p>
                                <p className="mt-0.5 max-w-[180px] truncate font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                                  {product.fileName} · {product.fileSize}
                                </p>
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                                {formatIDR(product.price)}
                              </td>
                              <td className="px-4 py-3.5">
                                {product.unlimitedStock ? (
                                  <span className="font-medium text-slate-600 dark:text-zinc-300">
                                    Tak terbatas
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      aria-label="Kurangi stok"
                                      disabled={busyActionId === product.id || product.stock <= 0}
                                      onClick={() => handleAdjustStock(product, -1)}
                                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <span
                                      className={`w-8 text-center font-mono font-semibold tabular-nums ${
                                        product.stock <= overview.settings.telegram.lowStockThreshold
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : 'text-slate-900 dark:text-zinc-100'
                                      }`}
                                    >
                                      {product.stock}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label="Tambah stok"
                                      disabled={busyActionId === product.id}
                                      onClick={() => handleAdjustStock(product, 1)}
                                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-700 dark:text-zinc-300">
                                {product.salesCount}
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProduct(product);
                                      setEditorOpen(true);
                                    }}
                                    className="inline-flex h-7 cursor-pointer items-center gap-1 rounded border border-slate-200 px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyActionId === product.id}
                                    onClick={() => handleDeleteProduct(product)}
                                    aria-label={`Hapus ${product.title}`}
                                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-800 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: PAYMENT SETTINGS */}
              {activeTab === 'payment' && (
                <PaymentSettingsPanel
                  payment={overview.settings.payment}
                  status={overview.paymentStatus}
                  adminToken={adminToken}
                  isStaticMode={isStaticMode}
                  serverlessAvailable={Boolean(serverlessHealth?.ok)}
                  onSaved={handleRefreshAll}
                />
              )}

              {/* TAB 4: NO-CODE VISUAL THEME & SEO EDITOR */}
              {activeTab === 'theme' && (
                <ThemeEditorPanel
                  theme={overview.settings.theme}
                  seo={overview.settings.seo}
                  adminToken={adminToken}
                  isStaticMode={isStaticMode}
                  onSaved={handleRefreshAll}
                />
              )}

              {/* TAB 5: TELEGRAM BOT SETTINGS */}
              {activeTab === 'telegram' && (
                <TelegramSettingsPanel
                  storeName={overview.settings.theme.storeName}
                  preferences={overview.settings.telegram}
                  status={overview.telegramStatus}
                  logs={overview.telegramLogs}
                  adminToken={adminToken}
                  isStaticMode={isStaticMode}
                  serverlessAvailable={Boolean(serverlessHealth?.ok)}
                  onUpdated={fetchOverview}
                />
              )}

              {/* TAB 5: DEPLOY & SEO */}
              {activeTab === 'deploy' && (
                <DeploySeoPanel
                  seo={overview.settings.seo}
                  products={overview.products}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Product Editor Modal */}
      {overview && (
        <ProductEditorModal
          key={editingProduct?.id || (editorOpen ? 'new-open' : 'closed')}
          open={editorOpen}
          product={editingProduct}
          categories={overview.settings.categories}
          adminToken={adminToken}
          isStaticMode={isStaticMode}
          onClose={() => {
            setEditorOpen(false);
            setEditingProduct(null);
          }}
          onSaved={handleRefreshAll}
        />
      )}
    </div>
  );
}
