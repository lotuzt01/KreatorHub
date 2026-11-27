import { useCallback, useEffect, useState } from 'react';
import type { CartItem, Product, StorefrontPayload } from './types/store';
import { darkenHex, getRadiusPx } from './lib/format';
import { getStaticStorefrontPayload } from './lib/staticFallback';
import { StorefrontHeader } from './components/StorefrontHeader';
import { StorefrontView } from './components/StorefrontView';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { AdminAuthGate } from './components/AdminAuthGate';
import { AdminDashboard, type ServerlessHealthInfo } from './components/AdminDashboard';

type AppRoute = 'storefront' | 'admin';

function updateMetaTag(selector: string, attribute: 'name' | 'property', key: string, value: string) {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>('storefront');
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('karsa_theme_mode');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });
  const [userToggledTheme, setUserToggledTheme] = useState<boolean>(() => {
    try {
      return Boolean(window.localStorage.getItem('karsa_theme_mode'));
    } catch {
      return false;
    }
  });

  // Cart & PDP state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Admin session token strictly held in React memory (never localStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isStaticMode, setIsStaticMode] = useState<boolean>(false);
  const [serverlessHealth, setServerlessHealth] = useState<ServerlessHealthInfo | null>(null);

  const loadStorefront = useCallback(async () => {
    try {
      const res = await fetch('/api/storefront', {
        headers: { Accept: 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        throw new Error('Static hosting detected');
      }
      const data = (await res.json()) as StorefrontPayload;
      setIsStaticMode(false);
      setServerlessHealth(null);
      setStorefront(data);

      // Respect store default theme if visitor hasn't explicitly toggled light/dark
      if (!userToggledTheme) {
        setIsDark(data.settings.theme.defaultMode === 'dark');
      }

      // Open specific product if shared via ?produk=slug SEO link
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('produk');
      if (slug) {
        const matched = data.products.find((p) => p.slug === slug);
        if (matched) setSelectedProduct(matched);
      }
    } catch {
      // Automatic fallback for Vercel Serverless or GitHub Pages static hosting
      const fallback = getStaticStorefrontPayload();
      setIsStaticMode(true);
      setStorefront(fallback);

      // Probe Vercel Serverless /api/health to detect live /api/telegram & /api/payment functions
      try {
        const healthRes = await fetch('/api/health', {
          headers: { Accept: 'application/json' },
        });
        const healthType = healthRes.headers.get('content-type') || '';
        if (healthRes.ok && healthType.includes('application/json')) {
          const healthData = (await healthRes.json()) as ServerlessHealthInfo;
          if (healthData?.ok) {
            setServerlessHealth(healthData);
          }
        }
      } catch {
        setServerlessHealth(null);
      }

      if (!userToggledTheme) {
        setIsDark(fallback.settings.theme.defaultMode === 'dark');
      }

      const params = new URLSearchParams(window.location.search);
      const slug = params.get('produk');
      if (slug) {
        const matched = fallback.products.find((p) => p.slug === slug);
        if (matched) setSelectedProduct(matched);
      }
    } finally {
      setLoading(false);
    }
  }, [userToggledTheme]);

  useEffect(() => {
    loadStorefront();
  }, [loadStorefront]);

  // Apply Dark Mode class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Apply customizable theme CSS variables & dynamic SEO tags + JSON-LD
  useEffect(() => {
    if (!storefront) return;
    const { theme, seo } = storefront.settings;

    const root = document.documentElement;
    root.style.setProperty('--store-accent', theme.accentColor);
    root.style.setProperty('--store-accent-hover', darkenHex(theme.accentColor));
    root.style.setProperty('--store-radius', getRadiusPx(theme.cornerStyle));

    // Dynamic SEO metadata sync
    document.title = seo.metaTitle || theme.storeName;
    updateMetaTag('meta[name="description"]', 'name', 'description', seo.metaDescription);
    updateMetaTag('meta[name="keywords"]', 'name', 'keywords', seo.keywords);
    updateMetaTag('meta[property="og:title"]', 'property', 'og:title', seo.metaTitle);
    updateMetaTag('meta[property="og:description"]', 'property', 'og:description', seo.metaDescription);
    updateMetaTag('meta[property="og:site_name"]', 'property', 'og:site_name', seo.ogSiteName || theme.storeName);
    updateMetaTag('meta[name="twitter:title"]', 'name', 'twitter:title', seo.metaTitle);
    updateMetaTag('meta[name="twitter:description"]', 'name', 'twitter:description', seo.metaDescription);

    const canonicalHref = seo.canonicalUrl || window.location.origin + window.location.pathname;
    updateMetaTag('meta[property="og:url"]', 'property', 'og:url', canonicalHref);

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalHref);

    // Update Schema.org JSON-LD with live products
    const jsonLdEl = document.getElementById('store-jsonld');
    if (jsonLdEl) {
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'OnlineStore',
        name: theme.storeName,
        description: seo.metaDescription,
        url: canonicalHref,
        email: theme.contactEmail,
        inLanguage: 'id-ID',
        currenciesAccepted: 'IDR',
        paymentAccepted: 'QRIS, Virtual Account, E-Wallet',
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: `Katalog ${theme.storeName}`,
          itemListElement: storefront.products.map((p, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            item: {
              '@type': 'Product',
              name: p.title,
              category: p.category,
              description: p.shortDescription,
              offers: {
                '@type': 'Offer',
                priceCurrency: 'IDR',
                price: String(p.price),
                availability:
                  p.unlimitedStock || p.stock > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
              },
            },
          })),
        },
      };
      jsonLdEl.textContent = JSON.stringify(schema);
    }
  }, [storefront]);

  const handleToggleTheme = () => {
    setUserToggledTheme(true);
    setIsDark((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem('karsa_theme_mode', next ? 'dark' : 'light');
      } catch {
        // Ignore storage errors in private iframes
      }
      return next;
    });
  };

  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      const maxAllowed = product.unlimitedStock ? 20 : Math.max(0, product.stock);
      if (maxAllowed <= 0) return prev;
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: Math.min(maxAllowed, i.quantity + 1) }
            : i,
        );
      }
      return [...prev, { productId: product.id, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const handleBuyNow = (product: Product) => {
    setSelectedProduct(null);
    handleAddToCart(product);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  };

  const handleAdminLogout = async () => {
    if (adminToken) {
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      }).catch(() => {});
    }
    setAdminToken(null);
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Admin Workspace Route
  if (route === 'admin') {
    if (!adminToken) {
      return (
        <AdminAuthGate
          storeName={storefront?.settings.theme.storeName || 'Karsa Digital'}
          isStaticMode={isStaticMode}
          onAuthenticated={(token) => setAdminToken(token)}
          onBackToStore={() => setRoute('storefront')}
        />
      );
    }

    return (
      <AdminDashboard
        adminToken={adminToken}
        isStaticMode={isStaticMode}
        serverlessHealth={serverlessHealth}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onExitAdmin={() => setRoute('storefront')}
        onLogout={handleAdminLogout}
        onStorefrontChanged={loadStorefront}
      />
    );
  }

  // Storefront Landing Page Route
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-zinc-950 dark:text-zinc-100">
      <StorefrontHeader
        storeName={storefront?.settings.theme.storeName || 'Karsa Digital'}
        cartCount={cartCount}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onOpenCart={() => setCartOpen(true)}
        onOpenAdmin={() => setRoute('admin')}
      />

      {loading || !storefront ? (
        <div className="mx-auto max-w-[1200px] space-y-10 px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-6">
              <div className="h-4 w-44 animate-pulse rounded bg-slate-200 dark:bg-zinc-800" />
              <div className="h-14 w-full animate-pulse rounded bg-slate-200 dark:bg-zinc-800" />
              <div className="h-20 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-zinc-800" />
            </div>
            <div className="aspect-16/10 animate-pulse rounded-xl bg-slate-200 lg:col-span-6 dark:bg-zinc-800" />
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <StorefrontView
            data={storefront}
            isDark={isDark}
            onToggleTheme={handleToggleTheme}
            onAddToCart={handleAddToCart}
            onSelectProduct={(p) => setSelectedProduct(p)}
            onOpenAdmin={() => setRoute('admin')}
          />

          <ProductDetailModal
            product={selectedProduct}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
          />

          <CartCheckoutDrawer
            open={cartOpen}
            isStaticMode={isStaticMode}
            serverlessAvailable={Boolean(serverlessHealth?.ok)}
            storeName={storefront.settings.theme.storeName}
            paymentSettings={storefront.settings.payment}
            items={cart}
            products={storefront.products}
            onClose={() => setCartOpen(false)}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={() => setCart([])}
            onOrderCompleted={loadStorefront}
          />
        </>
      )}
    </div>
  );
}
