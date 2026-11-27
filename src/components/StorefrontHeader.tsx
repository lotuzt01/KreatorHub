import { useState } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';
import type { StoreUiTexts } from '../types/store';

interface StorefrontHeaderProps {
  storeName: string;
  uiTexts?: StoreUiTexts;
  cartCount: number;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenCart: () => void;
}

export function StorefrontHeader({
  storeName,
  uiTexts,
  cartCount,
  isDark,
  onToggleTheme,
  onOpenCart,
}: StorefrontHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navCatalog = uiTexts?.navCatalog || 'Katalog';
  const navFeatures = uiTexts?.navFeatures || 'Keunggulan';
  const navCart = uiTexts?.navCart || 'Keranjang';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#beranda"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-zinc-50"
        >
          {storeName}
        </a>

        {/* Zone 2: Clean buyer-focused navigation links (Admin entry tucked discreetly in footer) */}
        <nav
          aria-label="Navigasi utama"
          className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex dark:text-zinc-300"
        >
          <a
            href="#katalog"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 dark:hover:text-white"
          >
            {navCatalog}
          </a>
          <a
            href="#keunggulan"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 dark:hover:text-white"
          >
            {navFeatures}
          </a>
          <button
            type="button"
            onClick={onToggleTheme}
            className="cursor-pointer whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 dark:hover:text-white"
          >
            {isDark ? 'Mode Terang' : 'Mode Gelap'}
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            style={{
              backgroundColor: 'var(--store-accent)',
              borderRadius: 'var(--store-radius)',
            }}
            className="inline-flex h-10 cursor-pointer items-center gap-2 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            <span className="tabular-nums">
              {cartCount > 0 ? `${navCart} (${cartCount})` : navCart}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden dark:border-zinc-800 dark:text-zinc-200"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-zinc-200">
            <a
              href="#katalog"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-zinc-900"
            >
              {navCatalog}
            </a>
            <a
              href="#keunggulan"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-zinc-900"
            >
              {navFeatures}
            </a>
            <button
              type="button"
              onClick={() => {
                onToggleTheme();
                setMobileMenuOpen(false);
              }}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-900"
            >
              {isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
