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
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0b0c1e]/85">
      <div className="mx-auto flex h-14 max-w-[1040px] items-center justify-between gap-6 px-4 sm:px-6">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#beranda"
          className="font-display text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
        >
          {storeName}
        </a>

        {/* Zone 2: Clean single-line navigation links */}
        <nav
          aria-label="Navigasi utama"
          className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex dark:text-slate-300"
        >
          <a
            href="#showcase"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 dark:hover:text-cyan-300"
          >
            Showcase
          </a>
          <a
            href="#katalog"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 dark:hover:text-cyan-300"
          >
            {navCatalog}
          </a>
          <a
            href="#keunggulan"
            className="whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 dark:hover:text-cyan-300"
          >
            {navFeatures}
          </a>
          <button
            type="button"
            onClick={onToggleTheme}
            className="cursor-pointer whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 hover:underline hover:underline-offset-4 dark:hover:text-cyan-300"
          >
            {isDark ? 'Mode Terang' : 'Mode Gelap'}
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="cta-gradient-btn inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-4 text-xs font-bold text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">
              {cartCount > 0 ? `${navCart} (${cartCount})` : navCart}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden dark:border-white/15 dark:text-slate-200"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden dark:border-white/10 dark:bg-[#0d0e24]">
          <div className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            <a
              href="#showcase"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              Showcase
            </a>
            <a
              href="#katalog"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              {navCatalog}
            </a>
            <a
              href="#keunggulan"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              {navFeatures}
            </a>
            <button
              type="button"
              onClick={() => {
                onToggleTheme();
                setMobileMenuOpen(false);
              }}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-white/10"
            >
              {isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
