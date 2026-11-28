import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Film,
  Instagram,
  Layers,
  Lightbulb,
  Lock,
  MessageCircle,
  Play,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Youtube,
  Zap,
} from 'lucide-react';
import type { CartItem, Product, StorefrontPayload } from '../types/store';
import { formatIDR, isSafeHttpOrLocalUrl } from '../lib/format';
import { SafeImage } from './SafeImage';

interface StorefrontViewProps {
  data: StorefrontPayload;
  cart: CartItem[];
  cartCount: number;
  isDark: boolean;
  onToggleTheme: () => void;
  onAddToCart: (product: Product) => void;
  onSelectProduct: (product: Product) => void;
  onOpenCart: () => void;
  onQuickBuy: (product: Product) => void;
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

function parseYouTubeId(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

function splitHeadlineForGradient(headline: string): { line1: string; line2: string } {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return { line1: words[0] || headline, line2: words.slice(1).join(' ') };
  }
  const splitIdx = Math.max(1, Math.ceil(words.length / 2));
  return {
    line1: words.slice(0, splitIdx).join(' '),
    line2: words.slice(splitIdx).join(' '),
  };
}

export function StorefrontView({
  data,
  cart,
  cartCount,
  isDark,
  onToggleTheme,
  onAddToCart,
  onSelectProduct,
  onOpenCart,
  onQuickBuy,
  onOpenAdmin,
}: StorefrontViewProps) {
  const { products, settings, stats } = data;
  const { theme, categories } = settings;
  const uiTexts = theme.uiTexts;
  const socialLinks = theme.socialLinks;

  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2400);
  };

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

  const featuredProduct = useMemo(() => {
    const available = products.filter((p) => p.unlimitedStock || p.stock > 0);
    const pool = available.length > 0 ? available : products;
    return pool.find((p) => p.featured) || pool[0] || null;
  }, [products]);

  const cartSubtotal = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    return cart.reduce((sum, item) => {
      const prod = map.get(item.productId);
      return sum + (prod ? prod.price * item.quantity : 0);
    }, 0);
  }, [cart, products]);

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

  const youtubeShowcaseId = useMemo(
    () => parseYouTubeId(socialLinks?.youtube),
    [socialLinks?.youtube],
  );

  const heroTitleParts = useMemo(
    () => splitHeadlineForGradient(theme.heroHeadline),
    [theme.heroHeadline],
  );

  const gridClass =
    theme.gridColumns === 2
      ? 'grid-cols-1 gap-5 md:grid-cols-2'
      : 'grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3';

  const navCatalogLabel = uiTexts?.navCatalog || 'Katalog';
  const navFeaturesLabel = uiTexts?.navFeatures || 'Keunggulan';
  const catalogTitle = uiTexts?.catalogTitle || 'Katalog Produk Digital';
  const catalogSubtitle =
    uiTexts?.catalogSubtitle ||
    'Pilih produk digital siap pakai dengan harga promo, verifikasi otomatis via Telegram, dan akses unduhan instan.';
  const featuresTitle =
    uiTexts?.featuresTitle || 'Dari Ide Menjadi Karya Digital Lebih Cepat';
  const featuresSubtitle =
    uiTexts?.featuresSubtitle ||
    'Alur kerja lengkap untuk mempercepat produksi konten, transaksi aman, dan pengiriman file instan langsung ke pembeli.';
  const buyButtonText = uiTexts?.buyButtonText || 'Beli';
  const detailButtonText = uiTexts?.detailButtonText || 'Detail';

  const painPoints = [
    {
      icon: Lightbulb,
      text: 'Bingung mencari ide & aset siap pakai yang konsisten setiap hari',
    },
    {
      icon: Clock,
      text: 'Proses kerja manual memakan waktu berjam-jam sebelum siap rilis',
    },
    {
      icon: Layers,
      text: 'Sulit menjaga kualitas visual dan alur produksi tetap rapi',
    },
    {
      icon: TrendingDown,
      text: 'Pertumbuhan audiens dan konversi melambat karena tidak konsisten',
    },
    {
      icon: Zap,
      text: 'Membutuhkan tools praktis yang langsung bisa dipakai tanpa ribet',
    },
  ];

  const featureCards = [
    {
      icon: Sparkles,
      title: 'Siap Pakai & Praktis',
      desc: 'Langsung gunakan template, skrip, dan alur kerja terstruktur dalam hitungan menit tanpa mulai dari nol.',
      cardStyle:
        'border-blue-500/30 bg-gradient-to-br from-blue-950/85 to-indigo-950/85 text-slate-100',
      lightStyle: 'border-blue-200 bg-blue-50/70 text-slate-900',
      spanClass: 'md:col-span-2',
    },
    {
      icon: ShieldCheck,
      title: 'Pembayaran Praktis & Verifikasi Cepat',
      desc: 'Mendukung konfirmasi rekening real-time via Bot Telegram maupun kanal pembayaran otomatis lainnya.',
      cardStyle:
        'border-purple-500/30 bg-gradient-to-br from-purple-950/85 to-fuchsia-950/85 text-slate-100',
      lightStyle: 'border-purple-200 bg-purple-50/70 text-slate-900',
      spanClass: 'md:col-span-1',
    },
    {
      icon: Send,
      title: 'Notifikasi Telegram 2-Arah',
      desc: 'Pesanan baru, bukti transfer, hingga tautan produk tersinkronisasi instan secara real-time.',
      cardStyle:
        'border-amber-500/30 bg-gradient-to-br from-amber-950/65 to-stone-900/90 text-slate-100',
      lightStyle: 'border-amber-200 bg-amber-50/70 text-slate-900',
      spanClass: 'md:col-span-1',
    },
    {
      icon: Film,
      title: 'Akses Unduhan Instan Setelah Lunas',
      desc: 'Begitu pembayaran terverifikasi, tautan download produk langsung terbuka otomatis di layar pembeli.',
      cardStyle:
        'border-cyan-500/30 bg-gradient-to-br from-cyan-950/80 to-slate-900/90 text-slate-100',
      lightStyle: 'border-cyan-200 bg-cyan-50/70 text-slate-900',
      spanClass: 'md:col-span-2',
    },
    {
      icon: Zap,
      title: 'Workflow Hemat Waktu Hingga 80%',
      desc: 'Fokus pada kreativitas dan hasil akhir — biarkan sistem katalog, stok, dan pengiriman bekerja otomatis.',
      cardStyle:
        'border-violet-500/30 bg-gradient-to-br from-violet-950/85 to-indigo-950/85 text-slate-100',
      lightStyle: 'border-violet-200 bg-violet-50/70 text-slate-900',
      spanClass: 'md:col-span-3',
    },
  ];

  const handleStickyCartClick = () => {
    if (cartCount > 0) {
      onOpenCart();
      return;
    }
    if (featuredProduct) {
      onAddToCart(featuredProduct);
      showToast(`"${featuredProduct.title}" ditambahkan ke keranjang.`);
    } else {
      onOpenCart();
    }
  };

  const handleStickyBuyNow = () => {
    if (cartCount > 0) {
      onOpenCart();
      return;
    }
    if (featuredProduct) {
      onQuickBuy(featuredProduct);
    } else {
      const el = document.getElementById('katalog');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const stickyDisplayPrice =
    cartCount > 0
      ? cartSubtotal
      : featuredProduct
        ? featuredProduct.price
        : null;

  return (
    <main
      id="beranda"
      className={`relative min-h-screen overflow-x-clip pb-24 ${
        isDark ? 'lp-canvas-dark text-slate-100' : 'lp-canvas-light text-slate-900'
      }`}
    >
      {/* Ambient top glow matching cosmic dark funnel */}
      {isDark && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-fuchsia-600/20 blur-3xl"
        />
      )}

      {/* SECTION 1: HERO FUNNEL */}
      <section className="relative mx-auto max-w-[680px] px-5 pt-10 pb-8 text-center sm:pt-14 sm:pb-10">
        <p className="inline-flex items-center justify-center rounded-full border border-purple-400/35 bg-purple-100/80 px-4 py-1.5 text-[11px] font-bold tracking-wider uppercase text-purple-900 backdrop-blur-sm dark:bg-purple-950/60 dark:text-purple-200">
          {theme.heroEyebrow}
        </p>

        <h1 className="mt-5 font-display text-[clamp(2rem,5.5vw,3.35rem)] font-black leading-[1.08] tracking-tight [text-wrap:balance]">
          <span className="block text-slate-900 dark:text-white dark:drop-shadow">
            {heroTitleParts.line1}
          </span>
          {heroTitleParts.line2 && (
            <span className="mt-0.5 block bg-gradient-to-r from-cyan-500 via-sky-500 to-fuchsia-500 bg-clip-text text-transparent dark:from-cyan-400 dark:via-sky-400 dark:to-fuchsia-400">
              {heroTitleParts.line2}
            </span>
          )}
        </h1>

        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-300">
          {theme.heroSubheadline}
        </p>

        {/* Cyan-to-Indigo Highlight Strip */}
        <div className="mt-6">
          <span className="shadow-glow-cyan inline-block rounded-full bg-gradient-to-r from-cyan-500 to-indigo-600 px-5 py-2 text-[11px] font-extrabold tracking-wide text-white">
            Akses Instan · Update Berkala · Pengiriman Otomatis
          </span>
        </div>

        {/* Primary Gradient CTA */}
        <div className="mt-4 flex flex-col items-center gap-3">
          <a
            href="#katalog"
            className="cta-gradient-btn inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-full px-6 font-display text-sm font-extrabold tracking-wide text-white whitespace-nowrap"
          >
            <span>{theme.heroCtaText}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mulai akses produk digital pilihan dengan verifikasi cepat
          </p>
        </div>
      </section>

      {/* SECTION 2: GLOWING VISUAL SHOWCASE ("LIHAT HASILNYA") */}
      <section id="showcase" className="mx-auto max-w-[960px] px-5 py-6">
        <div className="mb-5 text-center">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            Lihat Hasilnya
          </h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm dark:text-slate-400">
            Cuplikan tampilan &amp; kualitas aset digital dari {theme.storeName}
          </p>
        </div>

        <div
          className={`grid gap-5 ${
            youtubeShowcaseId ? 'grid-cols-1 md:grid-cols-2' : 'mx-auto max-w-[680px] grid-cols-1'
          }`}
        >
          {/* Glowing Hero Image Frame (uses user's uploaded hero image!) */}
          <div className="video-frame-glow">
            <div className="overflow-hidden rounded-[1rem] bg-slate-950">
              <div className="aspect-video w-full overflow-hidden bg-slate-900">
                <SafeImage
                  src={theme.heroImage}
                  alt={`Preview utama ${theme.storeName}`}
                  fallbackLabel={theme.storeName}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-3 bg-[#0f132b] px-4 py-2.5">
                <span className="truncate text-xs font-semibold text-slate-100">
                  {theme.storeName} — Preview Utama
                </span>
                <a
                  href="#katalog"
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
                >
                  <span>Lihat Katalog</span>
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>

          {/* Optional Live YouTube Showcase when admin enters a YouTube video link */}
          {youtubeShowcaseId && (
            <div className="video-frame-glow">
              <div className="overflow-hidden rounded-[1rem] bg-slate-950">
                <div className="aspect-video w-full bg-black">
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube.com/embed/${encodeURIComponent(youtubeShowcaseId)}?rel=0`}
                    title={`Video Showcase ${theme.storeName}`}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="flex items-center justify-between gap-3 bg-[#0f132b] px-4 py-2.5">
                  <span className="truncate text-xs font-semibold text-slate-100">
                    Demo &amp; Contoh Hasil Video
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-cyan-400 whitespace-nowrap">
                    <Play className="h-3 w-3" aria-hidden="true" />
                    <span>Video Showcase</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clean Unboxed Proof Metrics Strip */}
        <div className="mx-auto mt-8 grid max-w-[680px] grid-cols-3 gap-4 border-y border-slate-200/80 py-5 text-center dark:border-white/10">
          <div>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-900 sm:text-xl dark:text-cyan-300">
              {stats.totalProducts}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs dark:text-slate-400">
              Produk Aktif
            </p>
          </div>
          <div>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-900 sm:text-xl dark:text-emerald-400">
              {stats.completedOrders}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs dark:text-slate-400">
              Pesanan Lunas
            </p>
          </div>
          <div>
            <p className="font-mono text-lg font-bold tabular-nums text-slate-900 sm:text-xl dark:text-fuchsia-300">
              Instan
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 sm:text-xs dark:text-slate-400">
              Akses Unduhan
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 3: LIVE DIGITAL PRODUCT CATALOG */}
      <section id="katalog" className="mx-auto max-w-[1040px] px-5 py-10 sm:py-14">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-widest uppercase text-cyan-600 dark:text-cyan-400">
              Koleksi Pilihan
            </p>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {catalogTitle}
            </h2>
            <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">
              {catalogSubtitle}
            </p>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
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
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none sm:w-56 dark:border-white/15 dark:bg-[#11132b]/90 dark:text-white dark:placeholder:text-slate-400"
              />
            </div>

            <select
              aria-label="Urutkan produk"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-10 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 focus:border-cyan-400 focus:outline-none dark:border-white/15 dark:bg-[#11132b]/90 dark:text-slate-200"
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
          className="mt-6 flex items-center gap-2 overflow-x-auto pb-1"
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
                className={`h-9 cursor-pointer rounded-xl px-4 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-glow-cyan'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white py-14 text-center dark:border-white/15 dark:bg-[#101228]/85">
            <p className="font-display text-base font-bold text-slate-900 dark:text-white">
              Produk tidak ditemukan
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ubah kata kunci pencarian atau pilih kategori lain.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Semua');
                setSearchQuery('');
              }}
              className="mt-4 h-9 cursor-pointer rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/10"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <div className={`mt-7 grid ${gridClass}`}>
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
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-transform duration-200 ease-out hover:-translate-y-0.5 dark:border-white/15 dark:bg-[#10122a]/90 dark:hover:border-cyan-400/40"
                >
                  {/* 4:3 Product Cover */}
                  <button
                    type="button"
                    onClick={() => onSelectProduct(product)}
                    className="relative aspect-4/3 w-full cursor-pointer overflow-hidden bg-slate-100 text-left dark:bg-slate-950"
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
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{product.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{product.format}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          outOfStock
                            ? 'font-semibold text-red-500 dark:text-red-400'
                            : 'font-mono tabular-nums text-cyan-700 dark:text-cyan-300'
                        }
                      >
                        {stockLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="mt-2 cursor-pointer text-left font-display text-base font-extrabold leading-snug text-slate-900 transition-colors hover:text-fuchsia-600 dark:text-white dark:hover:text-cyan-300"
                    >
                      {product.title}
                    </button>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">
                      {product.shortDescription}
                    </p>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                      <div>
                        <p className="font-mono text-lg font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatIDR(product.price)}
                        </p>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <p className="font-mono text-xs tabular-nums text-slate-400 line-through dark:text-slate-500">
                            {formatIDR(product.originalPrice)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectProduct(product)}
                          className="h-9 cursor-pointer rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/10"
                        >
                          {detailButtonText}
                        </button>
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => onAddToCart(product)}
                          className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold whitespace-nowrap ${
                            outOfStock
                              ? 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-500'
                              : 'cta-gradient-btn text-white'
                          }`}
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

      {/* SECTION 4: PAIN POINTS CARD ("MASIH RIBET BIKIN KONTEN?") */}
      <section className="mx-auto max-w-[680px] px-5 py-6">
        <div className="rounded-2xl border border-pink-300/60 bg-gradient-to-b from-pink-50 to-white p-5 shadow-xl backdrop-blur-sm sm:p-7 dark:border-pink-500/25 dark:from-fuchsia-950/45 dark:to-slate-950/80">
          <h2 className="font-display text-lg font-extrabold leading-snug text-pink-600 sm:text-xl dark:text-pink-400">
            Masih Ribet Kerjakan Semuanya Manual?
          </h2>
          <ul className="mt-4 divide-y divide-slate-200 text-sm dark:divide-white/10">
            {painPoints.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.text} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-pink-500 dark:text-pink-400"
                    aria-hidden="true"
                  />
                  <span className="text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-200">
                    {item.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* SECTION 5: SOLUTION BRIDGE & GRADIENT FEATURE CARDS */}
      <section id="keunggulan" className="mx-auto max-w-[960px] px-5 py-10 sm:py-14">
        <div className="mx-auto max-w-[640px] text-center">
          <p className="text-[11px] font-bold tracking-widest uppercase text-cyan-600 dark:text-cyan-400">
            Solusi Kreator &amp; Bisnis Digital
          </p>
          <h2 className="mt-2 font-display text-2xl font-black leading-tight tracking-tight [text-wrap:balance] sm:text-3xl">
            <span className="bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent dark:from-fuchsia-400 dark:via-white dark:to-cyan-400">
              {featuresTitle}
            </span>
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">
            {featuresSubtitle}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`rounded-2xl border p-5 shadow-lg backdrop-blur-sm ${card.spanClass} ${
                  isDark ? card.cardStyle : card.lightStyle
                }`}
              >
                <Icon
                  className="h-5 w-5 text-cyan-600 dark:text-cyan-300"
                  aria-hidden="true"
                />
                <h3 className="mt-3 font-display text-sm font-extrabold text-slate-900 sm:text-base dark:text-cyan-300">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">
                  {card.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 6: CLOSING PROMO CTA CARD */}
      <section className="mx-auto max-w-[640px] px-5 pt-4 pb-10 text-center">
        <div className="rounded-3xl border border-purple-300/60 bg-gradient-to-b from-purple-50 via-indigo-50/70 to-white p-6 shadow-2xl sm:p-8 dark:border-purple-400/25 dark:from-purple-900/40 dark:via-indigo-950/60 dark:to-slate-950/90">
          <p className="text-[11px] font-bold tracking-widest uppercase text-amber-600 dark:text-amber-300">
            Siap Mulai Sekarang?
          </p>
          <h2 className="mt-2 font-display text-2xl font-black leading-tight [text-wrap:balance] sm:text-3xl">
            <span className="block text-slate-900 dark:text-white">
              Saatnya Berkarya &amp; Rilis
            </span>
            <span className="block text-cyan-600 dark:text-cyan-400">
              Lebih Cepat Tanpa Ribet.
            </span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">
            Dapatkan akses produk digital pilihan dengan verifikasi cepat dan tautan unduhan otomatis.
          </p>

          {featuredProduct && (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3.5 dark:border-white/10 dark:bg-black/40">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Harga Promo — {featuredProduct.title}
              </p>
              <div className="mt-1 flex items-center justify-center gap-2.5">
                {featuredProduct.originalPrice &&
                  featuredProduct.originalPrice > featuredProduct.price && (
                    <span className="font-mono text-sm tabular-nums text-slate-400 line-through">
                      {formatIDR(featuredProduct.originalPrice)}
                    </span>
                  )}
                <span className="font-display font-mono text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatIDR(featuredProduct.price)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleStickyBuyNow}
            className="cta-gradient-btn mt-5 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-6 font-display text-sm font-extrabold tracking-wide text-white"
          >
            <span>Akses Sekarang Juga</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* SECTION 7: QUIET FOOTER + SOCIAL MEDIA + DISCREET ADMIN ENTRY */}
      <footer className="border-t border-slate-200/80 py-10 dark:border-white/10">
        <div className="mx-auto max-w-[1040px] px-5">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                {theme.storeName}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {theme.footerNotice} · {theme.contactEmail}
              </p>

              {activeSocials.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {activeSocials.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={item.label}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      {item.icon === 'youtube' && (
                        <Youtube className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                      )}
                      {item.icon === 'tiktok' && (
                        <TikTokIcon className="h-3.5 w-3.5 text-slate-900 dark:text-white" />
                      )}
                      {item.icon === 'instagram' && (
                        <Instagram className="h-3.5 w-3.5 text-pink-500" aria-hidden="true" />
                      )}
                      {item.icon === 'whatsapp' && (
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                      )}
                      <span>{item.label}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-slate-600 dark:text-slate-400">
              <a href="#katalog" className="hover:text-slate-900 dark:hover:text-white">
                {navCatalogLabel}
              </a>
              <a href="#keunggulan" className="hover:text-slate-900 dark:hover:text-white">
                {navFeaturesLabel}
              </a>
              <button
                type="button"
                onClick={onToggleTheme}
                className="cursor-pointer hover:text-slate-900 dark:hover:text-white"
              >
                {isDark ? 'Mode Terang' : 'Mode Gelap'}
              </button>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200/80 pt-5 text-[11px] text-slate-400 dark:border-white/10 dark:text-slate-500">
            <span>
              &copy; {new Date().getFullYear()} {theme.storeName}. Hak cipta dilindungi.
            </span>
            <button
              type="button"
              onClick={onOpenAdmin}
              title="Masuk area pengelola toko"
              className="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400/80 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              <span>Pengelola</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-40 -translate-x-1/2">
          <div className="rounded-full border border-emerald-400/50 bg-slate-950/95 px-4 py-2 text-xs font-semibold text-white shadow-xl whitespace-nowrap">
            {toastMessage}
          </div>
        </div>
      )}

      {/* SECTION 8: STICKY BOTTOM BAR (LYNK.ID-STYLE CART + RED BUY NOW) */}
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[540px] -translate-x-1/2 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-8px_28px_rgba(0,0,0,0.35)] backdrop-blur-md sm:rounded-t-2xl sm:border-x dark:border-white/15 dark:bg-[#0e1026]/95">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleStickyCartClick}
            aria-label="Buka keranjang belanja"
            className="relative flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-50 text-emerald-600 transition active:scale-95 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25"
          >
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 font-mono text-[10px] font-bold tabular-nums text-white">
                {cartCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleStickyBuyNow}
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#b91c1c] px-4 font-display text-sm font-extrabold tracking-wider uppercase text-white shadow-md transition hover:bg-[#991b1b] active:scale-[0.99] whitespace-nowrap"
          >
            <span>BUY NOW</span>
            {stickyDisplayPrice !== null && (
              <span className="rounded-md bg-black/25 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
                {formatIDR(stickyDisplayPrice)}
              </span>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
