import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import type { CartItem, Product, StorefrontPayload } from './types/store';
import { darkenHex, getRadiusPx } from './lib/format';
import { auth, signOutAdmin, verifyAdminAccess } from './lib/firebase';
import {
  seedInitialStoreDataIfEmpty,
  subscribePublicStorefront,
} from './lib/firestoreStore';
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
  const [storeError, setStoreError] = useState<string | null>(null);
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
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  // Firebase Auth state for Admin Dashboard
  const [authReady, setAuthReady] = useState(false);
  const [adminUser, setAdminUser] = useState<User | null>(null);

  // Detect optional serverless API (/api/telegram, /api/payment) health
  const [serverlessHealth, setServerlessHealth] = useState<ServerlessHealthInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/health', { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) return null;
        return (await res.json()) as ServerlessHealthInfo;
      })
      .then((health) => {
        if (active && health?.ok) {
          setServerlessHealth(health);
        }
      })
      .catch(() => {
        // Running on pure static host (e.g. GitHub Pages) — Firestore still syncs in real time
      });

    return () => {
      active = false;
    };
  }, []);

  // Listen to Firebase Auth state for Admin access
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdminUser(null);
        setAuthReady(true);
        return;
      }
      const allowed = await verifyAdminAccess(user);
      if (allowed) {
        setAdminUser(user);
        void seedInitialStoreDataIfEmpty(user).catch((err) => {
          console.error('Failed to seed initial store data:', err);
        });
      } else {
        setAdminUser(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Firebase Firestore subscription for public storefront (products + theme + SEO + payment)
  useEffect(() => {
    const unsubscribe = subscribePublicStorefront(
      (payload) => {
        setStorefront(payload);
        setStoreError(null);
        setLoading(false);

        if (!userToggledTheme) {
          setIsDark(payload.settings.theme.defaultMode === 'dark');
        }
      },
      (err) => {
        setStoreError(err.message);
        setLoading(false);
      },
      serverlessHealth?.bankConfig,
    );

    return () => unsubscribe();
  }, [userToggledTheme, serverlessHealth?.bankConfig]);

  // Open specific product if shared via ?produk=slug SEO link
  useEffect(() => {
    if (!storefront || deepLinkHandled) return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('produk');
    if (slug) {
      const matched = storefront.products.find((p) => p.slug === slug || p.id === slug);
      if (matched) setSelectedProduct(matched);
    }
    setDeepLinkHandled(true);
  }, [storefront, deepLinkHandled]);

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
        paymentAccepted: 'Transfer Bank, QRIS, Virtual Account, E-Wallet',
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
    await signOutAdmin().catch(() => {});
    setAdminUser(null);
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Admin Workspace Route
  if (route === 'admin') {
    if (!authReady || !adminUser) {
      return (
        <AdminAuthGate
          storeName={storefront?.settings.theme.storeName || 'Karsa Digital'}
          authReady={authReady}
          onAuthenticated={(user) => setAdminUser(user)}
          onBackToStore={() => setRoute('storefront')}
        />
      );
    }

    return (
      <AdminDashboard
        adminEmail={adminUser.email || 'Admin'}
        serverlessHealth={serverlessHealth}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onExitAdmin={() => setRoute('storefront')}
        onLogout={handleAdminLogout}
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

      {storeError ? (
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-semibold">Gagal terhubung ke database real-time.</p>
            <p className="mt-1 text-xs opacity-90">{storeError}</p>
          </div>
        </div>
      ) : loading || !storefront ? (
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
            serverlessAvailable={Boolean(serverlessHealth?.ok)}
            storeName={storefront.settings.theme.storeName}
            paymentSettings={storefront.settings.payment}
            items={cart}
            products={storefront.products}
            onClose={() => setCartOpen(false)}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onClearCart={() => setCart([])}
          />
        </>
      )}
    </div>
  );
}
