import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Globe,
  Instagram,
  Layers,
  Lock,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Youtube,
} from 'lucide-react';
import type { Product, StorefrontPayload } from '../types/store';
import { formatIDR, isSafeHttpOrLocalUrl } from '../lib/format';
import { SafeImage } from './SafeImage';

interface StorefrontViewProps {
  data: StorefrontPayload;
  isDark: boolean;
  onToggleTheme: () => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onOpenAdmin: () => void;
}

type SortOption = 'featured' | 'price_asc' | 'price_desc' | 'popular';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export function StorefrontView({
  data,
  isDark,
  onToggleTheme,
  onAddToCart,
  onSelectProduct,
  onOpenAdmin,
}: StorefrontViewProps) {
  const { products, settings, stats } = data;
  const { theme, categories } = settings;
  const uiTexts = theme.uiTexts;
  const socialLinks = theme.socialLinks;

  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('featured');

  const availableCategories = useMemo(() => {
    const set = new Set<string>(categories);
    products.forEach((p) => set.add(p.category));
    return ['Semua', ...Array.from(set)];
  }, [categories, products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      const matchCat = selectedCategory === 'Semua' || p.category === selectedCategory;
      const matchQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.shortDescription.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.format.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'popular') return b.salesCount - a.salesCount;
      return Number(b.featured) - Number(a.featured) || b.salesCount - a.salesCount;
    });
  }, [products, selectedCategory, searchQuery, sortBy]);

  const activeSocials = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      href: string;
      icon: 'youtube' | 'tiktok' | 'instagram' | 'whatsapp';
    }> = [];
    if (socialLinks?.youtube && isSafeHttpOrLocalUrl(socialLinks.youtube)) {
      items.push({ id: 'youtube', label: 'YouTube', href: socialLinks.youtube, icon: 'youtube' });
    }
    if (socialLinks?.tiktok && isSafeHttpOrLocalUrl(socialLinks.tiktok)) {
      items.push({ id: 'tiktok', label: 'TikTok', href: socialLinks.tiktok, icon: 'tiktok' });
    }
    if (socialLinks?.instagram && isSafeHttpOrLocalUrl(socialLinks.instagram)) {
      items.push({ id: 'instagram', label: 'Instagram', href: socialLinks.instagram, icon: 'instagram' });
    }
    if (socialLinks?.whatsapp && isSafeHttpOrLocalUrl(socialLinks.whatsapp)) {
      items.push({ id: 'whatsapp', label: 'WhatsApp', href: socialLinks.whatsapp, icon: 'whatsapp' });
    }
    return items;
  }, [socialLinks]);

  const gridClass =
    theme.gridColumns === 2
      ? 'grid-cols-1 gap-8 md:grid-cols-2'
      : 'grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3';

  const navCatalogLabel = uiTexts?.navCatalog || 'Katalog';
  const navFeaturesLabel = uiTexts?.navFeatures || 'Keunggulan';
  const catalogTitle = uiTexts?.catalogTitle || 'Katalog Produk Digital';
  const catalogSubtitle =
    uiTexts?.catalogSubtitle ||
    'Semua produk dilengkapi pembaruan berkala, manajemen stok otomatis, dan tautan unduhan instan setelah pembayaran.';
  const featuresTitle =
    uiTexts?.featuresTitle ||
    'Infrastruktur toko digital yang cepat, otomatis, dan siap tumbuh.';
  const featuresSubtitle =
    uiTexts?.featuresSubtitle ||
    'Dirancang agar pemilik produk bisa mengatur katalog, tampilan visual, stok, serta notifikasi pesanan tanpa menulis ulang kode.';
  const buyButtonText = uiTexts?.buyButtonText || 'Beli';
  const detailButtonText = uiTexts?.detailButtonText || 'Detail';

  return (
    <main id="beranda">
      {/* SECTION 1: HERO SPLIT + FULL-WIDTH 4-COLUMN SUMMARY STRIP */}
      <section className="border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-[1200px] px-4 pt-12 pb-14 sm:px-6 lg:px-8 lg:pt-16 lg:pb-18">
          <div className="grid items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left Copy Column */}
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-sm font-medium text-slate-500 dark:text-zinc-400">
                {theme.heroEyebrow}
              </p>

              <h1 className="mt-4 font-display text-[clamp(2.25rem,4vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-slate-900 [text-wrap:balance] dark:text-zinc-50">
                {theme.heroHeadline}
              </h1>

              <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-slate-600 dark:text-zinc-300">
                {theme.heroSubheadline}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href="#katalog"
                  style={{
                    backgroundColor: 'var(--store-accent)',
                    borderRadius: 'var(--store-radius)',
                  }}
                  className="inline-flex h-12 items-center gap-2 px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  <span>{theme.heroCtaText}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>

                <a
                  href="#keunggulan"
                  style={{ borderRadius: 'var(--store-radius)' }}
                  className="inline-flex h-12 items-center px-5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  {navFeaturesLabel}
                </a>
              </div>
            </div>

            {/* Right Editorial Hero Visual */}
            <div className="lg:col-span-6">
              <div
                style={{ borderRadius: 'var(--store-radius)' }}
                className="aspect-16/10 overflow-hidden border border-slate-200 bg-slate-100 lg:aspect-auto lg:h-full dark:border-zinc-800 dark:bg-zinc-900"
              >
                <SafeImage
                  src={theme.heroImage}
                  alt={`Studio dan produk digital ${theme.storeName}`}
                  fallbackLabel={theme.storeName}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-Column Summary Strip directly below Hero Split */}
          <div className="mt-12 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8 lg:grid-cols-4 dark:border-zinc-800">
            <div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                {stats.totalProducts}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Produk digital aktif
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                {stats.completedOrders}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Pesanan terverifikasi otomatis
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                &lt; 3 detik
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Pengiriman file &amp; notif Telegram
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                Real-Time
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                Akses unduhan instan setelah lunas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: FEATURED DIGITAL PRODUCT CATALOG */}
      <section
        id="katalog"
        className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-zinc-50">
              {catalogTitle}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
              {catalogSubtitle}
            </p>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari produk atau format..."
                aria-label="Cari produk digital"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none sm:w-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            <select
              aria-label="Urutkan produk"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-10 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-blue-600 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option value="featured">Unggulan</option>
              <option value="popular">Terlaris</option>
              <option value="price_asc">Harga Terendah</option>
              <option value="price_desc">Harga Tertinggi</option>
            </select>
          </div>
        </div>

        {/* Interactive Category Segmented Filter Bar */}
        <div
          role="tablist"
          aria-label="Filter kategori produk"
          className="mt-7 flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          {availableCategories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat)}
                className={`h-9 cursor-pointer rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="mt-10 rounded-xl border border-slate-200 bg-white py-16 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-zinc-100">
              Produk tidak ditemukan
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
              Ubah kata kunci pencarian atau pilih kategori lain.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Semua');
                setSearchQuery('');
              }}
              className="mt-4 h-9 cursor-pointer rounded-lg border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <div className={`mt-8 grid ${gridClass}`}>
            {filteredProducts.map((product) => {
              const outOfStock = !product.unlimitedStock && product.stock <= 0;
              const stockLabel = product.unlimitedStock
                ? 'Stok instan'
                : outOfStock
                  ? 'Stok habis'
                  : `Sisa ${product.stock}`;

              return (
                <article
                  key={product.id}
                  style={{ borderRadius: 'var(--store-radius)' }}
                  className="group flex flex-col overflow-hidden border border-slate-200 bg-white transition-transform duration-200 ease-out hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {/* 4:3 Product Cover */}
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    className="relative aspect-4/3 w-full cursor-pointer overflow-hidden bg-slate-100 text-left dark:bg-zinc-950"
                  >
                    <SafeImage
                      src={product.coverImage}
                      alt={product.title}
                      fallbackLabel={product.title}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  </button>

                  {/* Card Content — Unboxed metadata with · separators */}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
                      <span>{product.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{product.format}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          outOfStock
                            ? 'font-medium text-red-600 dark:text-red-400'
                            : 'font-mono tabular-nums'
                        }
                      >
                        {stockLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="mt-2 cursor-pointer text-left font-display text-base font-semibold leading-snug text-slate-900 transition-colors hover:text-blue-700 dark:text-zinc-50 dark:hover:text-blue-400"
                    >
                      {product.title}
                    </button>

                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
                      {product.shortDescription}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                      <div>
                        <p className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                          {formatIDR(product.price)}
                        </p>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <p className="font-mono text-xs tabular-nums text-slate-400 line-through dark:text-zinc-500">
                            {formatIDR(product.originalPrice)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(product)}
                          className="h-9 cursor-pointer rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                        >
                          {detailButtonText}
                        </button>
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => onAddToCart(product)}
                          style={{
                            backgroundColor: outOfStock ? undefined : 'var(--store-accent)',
                            borderRadius: 'calc(var(--store-radius) - 4px)',
                          }}
                          className="inline-flex h-9 cursor-pointer items-center gap-1.5 px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{outOfStock ? 'Habis' : buyButtonText}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: AUTOMATION, TELEGRAM, & DEPLOYMENT BENTO */}
      <section
        id="keunggulan"
        className="border-t border-slate-200 bg-white py-16 lg:py-20 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl [text-wrap:balance] dark:text-zinc-50">
              {featuresTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-zinc-400">
              {featuresSubtitle}
            </p>
          </div>

          {/* Asymmetric Bento Grid */}
          <div className="mt-10 grid gap-6 lg:grid-cols-12">
            <div
              style={{ borderRadius: 'var(--store-radius)' }}
              className="border border-slate-200 bg-slate-50/70 p-6 sm:p-8 lg:col-span-7 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <ShieldCheck className="h-5 w-5 text-slate-700 dark:text-zinc-300" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
                01. Pembayaran Praktis &amp; Verifikasi Instan
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Mendukung transfer bank via konfirmasi Telegram langsung maupun metode pembayaran lain. Begitu pembayaran terverifikasi, tautan unduhan aplikasi langsung terbuka otomatis di layar Anda.
              </p>
            </div>

            <div
              style={{ borderRadius: 'var(--store-radius)' }}
              className="border border-slate-200 bg-slate-50/70 p-6 sm:p-8 lg:col-span-5 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <Send className="h-5 w-5 text-slate-700 dark:text-zinc-300" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
                02. Notifikasi Bot Telegram Real-Time
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Setiap pesanan baru, konfirmasi transfer, hingga pengiriman tautan produk diproses langsung secara real-time tanpa menunggu lama.
              </p>
            </div>

            <div
              style={{ borderRadius: 'var(--store-radius)' }}
              className="border border-slate-200 bg-slate-50/70 p-6 sm:p-8 lg:col-span-5 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <Layers className="h-5 w-5 text-slate-700 dark:text-zinc-300" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
                03. Pembaruan &amp; Akses Produk Terjamin
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Setiap produk digital dikurasi dengan dokumentasi jelas, lisensi resmi, dan tautan unduhan aman yang langsung dikirim setelah transaksi lunas.
              </p>
            </div>

            <div
              style={{ borderRadius: 'var(--store-radius)' }}
              className="border border-slate-200 bg-slate-50/70 p-6 sm:p-8 lg:col-span-7 dark:border-zinc-800 dark:bg-zinc-900/70"
            >
              <Globe className="h-5 w-5 text-slate-700 dark:text-zinc-300" aria-hidden="true" />
              <h3 className="mt-4 font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
                04. Sinkronisasi Cloud Cepat di Semua Perangkat
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Pesan lewat ponsel atau laptop dengan nyaman — status pesanan dan akses unduhan selalu tersinkronisasi seketika secara aman.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: QUIET FOOTER + SOCIAL MEDIA + DISCREET ADMIN ACCESS */}
      <footer className="border-t border-slate-200 bg-slate-50 py-10 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-display text-base font-bold text-slate-900 dark:text-zinc-50">
                {theme.storeName}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                {theme.footerNotice} · {theme.contactEmail}
              </p>

              {/* Active Social Media Links (YouTube, TikTok, Instagram, WhatsApp) */}
              {activeSocials.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {activeSocials.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white"
                    >
                      {item.icon === 'youtube' && (
                        <Youtube className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                      )}
                      {item.icon === 'tiktok' && (
                        <TikTokIcon className="h-3.5 w-3.5 text-slate-900 dark:text-zinc-100" />
                      )}
                      {item.icon === 'instagram' && (
                        <Instagram className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" aria-hidden="true" />
                      )}
                      {item.icon === 'whatsapp' && (
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      )}
                      <span>{item.label}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-600 dark:text-zinc-400">
              <a href="#katalog" className="hover:text-slate-900 dark:hover:text-zinc-100">
                {navCatalogLabel}
              </a>
              <a href="#keunggulan" className="hover:text-slate-900 dark:hover:text-zinc-100">
                {navFeaturesLabel}
              </a>
              <button
                type="button"
                onClick={onToggleTheme}
                className="cursor-pointer hover:text-slate-900 dark:hover:text-zinc-100"
              >
                {isDark ? 'Mode Terang' : 'Mode Gelap'}
              </button>
            </div>
          </div>

          {/* Subtle bottom legal row with discreet Admin Login trigger */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-200/80 pt-5 text-[11px] text-slate-400 dark:border-zinc-800/80 dark:text-zinc-600">
            <span>
              &copy; {new Date().getFullYear()} {theme.storeName}. Hak cipta dilindungi.
            </span>
            <button
              type="button"
              onClick={onOpenAdmin}
              title="Masuk area pengelola toko"
              className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400/75 transition-colors hover:text-slate-600 dark:text-zinc-600 dark:hover:text-zinc-400"
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              <span>Pengelola</span>
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
