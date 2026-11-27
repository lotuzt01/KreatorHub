import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type {
  AdminOverviewPayload,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentSettings,
  Product,
  SeoConfig,
  StoreSettings,
  StorefrontPayload,
  TelegramLog,
  TelegramPreferences,
  ThemeConfig,
} from '../types/store';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  OperationType,
  db,
  handleFirestoreError,
} from './firebase';
import {
  applyVercelBankConfig,
  getDefaultStaticSettings,
  type VercelBankConfig,
} from './staticFallback';

export interface OrderStatusSnapshot {
  orderId: string;
  invoiceCode: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  totalAmount: number;
  adminBankName?: string;
  adminBankNumber?: string;
  adminBankHolder?: string;
  adminTransferAmount?: number;
  transferProofNote?: string;
  downloadReady: boolean;
  createdAt: string;
  updatedAt: string;
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'seconds' in value &&
    typeof (value as { seconds?: unknown }).seconds === 'number'
  ) {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function randomHex(bytes = 12): string {
  const arr = new Uint8Array(bytes);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i += 1) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getSeedProducts(): Omit<Product, 'createdAt' | 'updatedAt'>[] {
  return [
    {
      id: 'prod-uikit-01',
      slug: 'nusantara-ui-sistem-desain-saas',
      title: 'Nusantara UI — Sistem Desain SaaS & Dashboard',
      category: 'UI Kit & Template',
      price: 249000,
      originalPrice: 349000,
      stock: 18,
      unlimitedStock: false,
      shortDescription:
        '140+ komponen antarmuka modern siap pakai dengan dukungan penuh mode terang, mode gelap, dan token Tailwind v4.',
      description:
        'Sistem desain lengkap untuk tim produk dan freelancer yang ingin membangun dashboard SaaS, portal admin, dan landing page berstandar produksi tanpa memulai dari nol.',
      highlights: [
        '140+ komponen responsif dengan varian Light & Dark Mode',
        '18 halaman siap pakai: Analitik, Pesanan, Editor, dan Pengaturan',
        'Token warna, spasi, dan tipografi selaras Tailwind CSS v4',
        'Lisensi komersial untuk proyek klien tanpa batas',
      ],
      format: 'FIG + Token JSON',
      fileSize: '42 KB',
      fileName: 'Nusantara-UI-Design-System.txt',
      fileKey: 'cloud-uikit',
      coverImage: '/src/assets/images/product_uikit_saas_1795750142065.jpg',
      status: 'active',
      featured: true,
      salesCount: 64,
    },
    {
      id: 'prod-ebook-02',
      slug: 'panduan-praktis-seo-performa-web-modern',
      title: 'Panduan Praktis SEO & Performa Web Modern',
      category: 'E-Book & Panduan',
      price: 129000,
      originalPrice: 179000,
      stock: -1,
      unlimitedStock: true,
      shortDescription:
        'Buku panduan 185 halaman tentang optimasi mesin pencari, Schema JSON-LD, dan deployment super cepat di Vercel & Netlify.',
      description:
        'Disusun berdasarkan studi kasus nyata peluncuran puluhan situs komersial dan toko digital agar situs Anda cepat terindeks di halaman pertama.',
      highlights: [
        '185 halaman materi terstruktur berbahasa Indonesia yang lugas',
        'Template Schema.org JSON-LD untuk Toko Digital & Artikel',
        'Checklist konfigurasi GitHub Pages, Vercel, dan Netlify gratis',
        'Bonus lembar kerja riset kata kunci dan audit halaman',
      ],
      format: 'PDF + Checklist',
      fileSize: '36 KB',
      fileName: 'Panduan-SEO-Performa-Web-Modern.txt',
      fileKey: 'cloud-ebook',
      coverImage: '/src/assets/images/product_ebook_seo_1795750142064.jpg',
      status: 'active',
      featured: true,
      salesCount: 112,
    },
    {
      id: 'prod-code-03',
      slug: 'kit-kode-toko-digital-checkout-otomatis',
      title: 'Kit Kode Toko Digital & Checkout Otomatis',
      category: 'Source Code',
      price: 389000,
      originalPrice: 499000,
      stock: 4,
      unlimitedStock: false,
      shortDescription:
        'Boilerplate full-stack TypeScript untuk jualan produk digital lengkap dengan dasbor stok dan integrasi Bot Telegram.',
      description:
        'Hemat berminggu-minggu waktu pengembangan dengan fondasi kode yang bersih, teruji, dan siap di-deploy ke GitHub Pages, Vercel, Netlify, atau Cloud Run.',
      highlights: [
        'Kode sumber penuh React 19, TypeScript, Tailwind v4, dan Express',
        'Integrasi notifikasi Bot Telegram real-time tanpa biaya pihak ketiga',
        'Sistem manajemen stok otomatis dan proteksi tautan unduhan',
        'Siap deploy satu klik ke GitHub Pages, Vercel, atau Netlify',
      ],
      format: 'ZIP Source Code',
      fileSize: '58 KB',
      fileName: 'Kit-Kode-Toko-Digital-Otomatis.txt',
      fileKey: 'cloud-code',
      coverImage: '/src/assets/images/product_code_starter_1795750142604.jpg',
      status: 'active',
      featured: true,
      salesCount: 41,
    },
    {
      id: 'prod-brand-04',
      slug: 'paket-template-pitch-deck-identitas-visual',
      title: 'Paket Template Pitch Deck & Identitas Visual',
      category: 'Aset Desain',
      price: 175000,
      stock: 25,
      unlimitedStock: false,
      shortDescription:
        '48 slide presentasi bergaya editorial arsitektural lengkap dengan panduan brand book untuk agensi dan startup.',
      description:
        'Tingkatkan daya tarik proposal klien dan presentasi pendanaan dengan tata letak editorial yang rapi, palet netral premium, dan tipografi terstruktur.',
      highlights: [
        '48 tata letak slide fleksibel untuk pitch investor & laporan klien',
        'Template Brand Guidelines 24 halaman siap disesuaikan',
        'Kompatibel dengan Figma, Keynote, dan Google Slides',
        'Panduan komposisi warna dan hierarki tipografi profesional',
      ],
      format: 'FIG + Slide Deck',
      fileSize: '28 KB',
      fileName: 'Paket-Pitch-Deck-Identitas-Visual.txt',
      fileKey: 'cloud-brand',
      coverImage: '/src/assets/images/product_brand_templates_1795750143149.jpg',
      status: 'active',
      featured: false,
      salesCount: 29,
    },
  ];
}

function mapProductDoc(id: string, raw: Record<string, unknown>): Product {
  return {
    id,
    slug: String(raw.slug || id),
    title: String(raw.title || 'Produk Digital'),
    category: String(raw.category || 'UI Kit & Template'),
    price: Number(raw.price || 0),
    originalPrice:
      typeof raw.originalPrice === 'number' && raw.originalPrice > 0
        ? raw.originalPrice
        : undefined,
    stock: Number(raw.stock ?? -1),
    unlimitedStock: Boolean(raw.unlimitedStock),
    shortDescription: String(raw.shortDescription || ''),
    description: String(raw.description || ''),
    highlights: Array.isArray(raw.highlights)
      ? raw.highlights.map((h) => String(h))
      : [],
    format: String(raw.format || 'Digital File'),
    fileSize: String(raw.fileSize || '24 KB'),
    fileName: String(raw.fileName || 'produk.txt'),
    fileKey: String(raw.fileKey || id),
    coverImage: String(
      raw.coverImage || '/src/assets/images/product_uikit_saas_1795750142065.jpg',
    ),
    status: raw.status === 'draft' ? 'draft' : 'active',
    featured: Boolean(raw.featured),
    salesCount: Number(raw.salesCount || 0),
    createdAt: timestampToIso(raw.createdAt),
    updatedAt: timestampToIso(raw.updatedAt),
  };
}

function mapOrderDoc(id: string, raw: Record<string, unknown>): Order {
  return {
    id,
    invoiceCode: String(raw.invoiceCode || id),
    customerName: String(raw.customerName || ''),
    customerEmail: String(raw.customerEmail || ''),
    customerPhone: String(raw.customerPhone || ''),
    paymentMethod: (raw.paymentMethod as PaymentMethod) || 'telegram_bank',
    paymentReference: String(raw.paymentReference || ''),
    items: Array.isArray(raw.items) ? (raw.items as OrderItem[]) : [],
    totalAmount: Number(raw.totalAmount || 0),
    status: (raw.status as OrderStatus) || 'PENDING',
    downloadToken: String(raw.downloadToken || ''),
    telegramStatus:
      (raw.telegramStatus as Order['telegramStatus']) || 'pending',
    telegramMessage:
      typeof raw.telegramMessage === 'string' ? raw.telegramMessage : undefined,
    telegramOrderMessageId:
      typeof raw.telegramOrderMessageId === 'number'
        ? raw.telegramOrderMessageId
        : undefined,
    telegramTransferMessageId:
      typeof raw.telegramTransferMessageId === 'number'
        ? raw.telegramTransferMessageId
        : undefined,
    adminBankName:
      typeof raw.adminBankName === 'string' ? raw.adminBankName : undefined,
    adminBankNumber:
      typeof raw.adminBankNumber === 'string' ? raw.adminBankNumber : undefined,
    adminBankHolder:
      typeof raw.adminBankHolder === 'string' ? raw.adminBankHolder : undefined,
    adminTransferAmount:
      typeof raw.adminTransferAmount === 'number'
        ? raw.adminTransferAmount
        : undefined,
    transferProofNote:
      typeof raw.transferProofNote === 'string'
        ? raw.transferProofNote
        : undefined,
    createdAt: timestampToIso(raw.createdAt),
    paidAt: raw.paidAt ? timestampToIso(raw.paidAt) : undefined,
  };
}

function mapTelegramLogDoc(id: string, raw: Record<string, unknown>): TelegramLog {
  return {
    id,
    timestamp: timestampToIso(raw.timestamp),
    event: (raw.event as TelegramLog['event']) || 'test',
    orderId: typeof raw.orderId === 'string' ? raw.orderId : undefined,
    status: (raw.status as TelegramLog['status']) || 'sent',
    detail: String(raw.detail || ''),
    preview: String(raw.preview || ''),
  };
}

function normalizePublicSettings(raw: Record<string, unknown> | undefined): {
  theme: ThemeConfig;
  seo: SeoConfig;
  payment: PaymentSettings;
  categories: string[];
} {
  const defaults = getDefaultStaticSettings();
  if (!raw) {
    return {
      theme: defaults.theme,
      seo: defaults.seo,
      payment: defaults.payment,
      categories: defaults.categories,
    };
  }

  const rawPayment = (raw.payment as Partial<PaymentSettings> | undefined) || {};
  const methods =
    Array.isArray(rawPayment.methods) && rawPayment.methods.length > 0
      ? rawPayment.methods
      : defaults.payment.methods;

  return {
    theme: {
      ...defaults.theme,
      ...((raw.theme as Partial<ThemeConfig> | undefined) || {}),
    },
    seo: {
      ...defaults.seo,
      ...((raw.seo as Partial<SeoConfig> | undefined) || {}),
    },
    payment: {
      ...defaults.payment,
      ...rawPayment,
      methods,
    },
    categories:
      Array.isArray(raw.categories) && raw.categories.length > 0
        ? raw.categories.map((c) => String(c))
        : defaults.categories,
  };
}

function normalizeAdminSettings(
  raw: Record<string, unknown> | undefined,
): TelegramPreferences {
  const defaults = getDefaultStaticSettings().telegram;
  if (!raw) return defaults;
  return {
    notifyOnOrderCreated:
      typeof raw.notifyOnOrderCreated === 'boolean'
        ? raw.notifyOnOrderCreated
        : defaults.notifyOnOrderCreated,
    notifyOnOrderPaid:
      typeof raw.notifyOnOrderPaid === 'boolean'
        ? raw.notifyOnOrderPaid
        : defaults.notifyOnOrderPaid,
    notifyOnLowStock:
      typeof raw.notifyOnLowStock === 'boolean'
        ? raw.notifyOnLowStock
        : defaults.notifyOnLowStock,
    lowStockThreshold:
      typeof raw.lowStockThreshold === 'number'
        ? raw.lowStockThreshold
        : defaults.lowStockThreshold,
    customChatIdOverride:
      typeof raw.customChatIdOverride === 'string'
        ? raw.customChatIdOverride
        : defaults.customChatIdOverride,
    messageHeader:
      typeof raw.messageHeader === 'string'
        ? raw.messageHeader
        : defaults.messageHeader,
  };
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Seeds initial storefront catalog & settings into Firestore the very first time
 * the bootstrapped admin signs in to an empty cloud database.
 */
export async function seedInitialStoreDataIfEmpty(user: User): Promise<void> {
  const defaults = getDefaultStaticSettings();

  // Ensure bootstrapped admin record exists in /admins/{uid}
  if (user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
    const adminPath = `admins/${user.uid}`;
    try {
      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      if (!adminSnap.exists()) {
        await setDoc(doc(db, 'admins', user.uid), {
          uid: user.uid,
          email: user.email,
          role: 'admin',
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, adminPath);
    }
  }

  // Seed /publicSettings/store if absent
  try {
    const pubSnap = await getDoc(doc(db, 'publicSettings', 'store'));
    if (!pubSnap.exists()) {
      await setDoc(doc(db, 'publicSettings', 'store'), {
        theme: defaults.theme,
        seo: defaults.seo,
        payment: defaults.payment,
        categories: defaults.categories,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'publicSettings/store');
  }

  // Seed /adminSettings/telegram if absent
  try {
    const admSnap = await getDoc(doc(db, 'adminSettings', 'telegram'));
    if (!admSnap.exists()) {
      await setDoc(doc(db, 'adminSettings', 'telegram'), {
        ...defaults.telegram,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'adminSettings/telegram');
  }

  // Seed initial catalog products if /products collection is empty
  try {
    const prodSnap = await getDocs(collection(db, 'products'));
    if (prodSnap.empty) {
      const batch = writeBatch(db);
      for (const item of getSeedProducts()) {
        batch.set(
          doc(db, 'products', item.id),
          stripUndefined({
            ...item,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

/**
 * Real-time subscription to the public storefront (active products + public settings).
 * Syncs live across all visitors, Vercel, GitHub Pages, and AI Studio preview.
 */
export function subscribePublicStorefront(
  onData: (payload: StorefrontPayload) => void,
  onError: (err: Error) => void,
  bankConfig?: VercelBankConfig | null,
): Unsubscribe {
  let productsReady = false;
  let settingsReady = false;
  let liveProducts: Product[] = [];
  let publicSettings = normalizePublicSettings(undefined);
  let hasRemoteSettings = false;

  const emit = () => {
    if (!productsReady || !settingsReady) return;
    // Before admin ever opens the dashboard to seed, show default curated catalog smoothly
    const effectiveProducts =
      liveProducts.length > 0 || hasRemoteSettings
        ? liveProducts
        : getSeedProducts().map((p) => ({
            ...p,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));

    const sortedProducts = [...effectiveProducts].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );

    const effectivePayment = applyVercelBankConfig(
      publicSettings.payment,
      bankConfig,
    );

    onData({
      products: sortedProducts,
      settings: {
        theme: publicSettings.theme,
        seo: publicSettings.seo,
        payment: effectivePayment,
        categories: publicSettings.categories,
      },
      stats: {
        totalProducts: sortedProducts.length,
        totalCategories: publicSettings.categories.length,
        completedOrders: sortedProducts.reduce((acc, p) => acc + p.salesCount, 0),
      },
    });
  };

  const activeProductsQuery = query(
    collection(db, 'products'),
    where('status', '==', 'active'),
  );

  const unsubProducts = onSnapshot(
    activeProductsQuery,
    (snapshot) => {
      liveProducts = snapshot.docs.map((d) =>
        mapProductDoc(d.id, d.data() as Record<string, unknown>),
      );
      productsReady = true;
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    },
  );

  const unsubSettings = onSnapshot(
    doc(db, 'publicSettings', 'store'),
    (snapshot) => {
      hasRemoteSettings = snapshot.exists();
      publicSettings = normalizePublicSettings(
        snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined,
      );
      settingsReady = true;
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'publicSettings/store');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    },
  );

  return () => {
    unsubProducts();
    unsubSettings();
  };
}

/**
 * Real-time Admin Dashboard subscription across products, orders, settings, and Telegram logs.
 */
export function subscribeAdminOverview(
  onData: (payload: AdminOverviewPayload) => void,
  onError: (err: Error) => void,
  serverlessHealth?: {
    telegramBotConfigured?: boolean;
    telegramChatConfigured?: boolean;
    midtransConfigured?: boolean;
    webhookSecretConfigured?: boolean;
    paymentMode?: 'production' | 'sandbox';
    bankConfig?: VercelBankConfig | null;
  } | null,
): Unsubscribe {
  let products: Product[] = [];
  let orders: Order[] = [];
  let telegramLogs: TelegramLog[] = [];
  let publicSettings = normalizePublicSettings(undefined);
  let adminTelegram = normalizeAdminSettings(undefined);
  const ready = {
    products: false,
    orders: false,
    publicSettings: false,
    adminSettings: false,
    logs: false,
  };

  const emit = () => {
    if (
      !ready.products ||
      !ready.orders ||
      !ready.publicSettings ||
      !ready.adminSettings ||
      !ready.logs
    ) {
      return;
    }

    const sortedProducts = [...products].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const sortedOrders = [...orders].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const sortedLogs = [...telegramLogs]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 50);

    const threshold = adminTelegram.lowStockThreshold ?? 5;
    const paidOrders = sortedOrders.filter((o) => o.status === 'PAID');
    const pendingOrders = sortedOrders.filter(
      (o) =>
        o.status === 'PENDING' ||
        o.status === 'AWAITING_BANK' ||
        o.status === 'PAYMENT_SUBMITTED',
    );
    const activeProducts = sortedProducts.filter((p) => p.status === 'active');
    const lowStockProducts = activeProducts.filter(
      (p) => !p.unlimitedStock && p.stock <= threshold,
    );

    const effectivePayment = applyVercelBankConfig(
      publicSettings.payment,
      serverlessHealth?.bankConfig,
    );

    onData({
      products: sortedProducts,
      orders: sortedOrders,
      settings: {
        theme: publicSettings.theme,
        seo: publicSettings.seo,
        payment: effectivePayment,
        categories: publicSettings.categories,
        telegram: adminTelegram,
      },
      telegramStatus: {
        botTokenConfigured: Boolean(serverlessHealth?.telegramBotConfigured),
        envChatIdConfigured: Boolean(serverlessHealth?.telegramChatConfigured),
        effectiveChatIdMasked: serverlessHealth?.telegramChatConfigured
          ? 'Terpasang di Server'
          : null,
      },
      paymentStatus: {
        midtransConfigured: Boolean(serverlessHealth?.midtransConfigured),
        webhookSecretConfigured: Boolean(serverlessHealth?.webhookSecretConfigured),
        mode: serverlessHealth?.paymentMode || 'sandbox',
      },
      telegramLogs: sortedLogs,
      metrics: {
        totalRevenue: paidOrders.reduce(
          (sum, o) => sum + (o.adminTransferAmount ?? o.totalAmount),
          0,
        ),
        paidOrdersCount: paidOrders.length,
        pendingOrdersCount: pendingOrders.length,
        activeProductsCount: activeProducts.length,
        lowStockProductsCount: lowStockProducts.length,
      },
    });
  };

  const unsubProducts = onSnapshot(
    collection(db, 'products'),
    (snap) => {
      products = snap.docs.map((d) =>
        mapProductDoc(d.id, d.data() as Record<string, unknown>),
      );
      ready.products = true;
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    },
  );

  const unsubOrders = onSnapshot(
    collection(db, 'orders'),
    (snap) => {
      orders = snap.docs.map((d) =>
        mapOrderDoc(d.id, d.data() as Record<string, unknown>),
      );
      ready.orders = true;
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    },
  );

  const unsubPublicSettings = onSnapshot(
    doc(db, 'publicSettings', 'store'),
    (snap) => {
      publicSettings = normalizePublicSettings(
        snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
      );
      ready.publicSettings = true;
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'publicSettings/store');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    },
  );

  const unsubAdminSettings = onSnapshot(
    doc(db, 'adminSettings', 'telegram'),
    (snap) => {
      adminTelegram = normalizeAdminSettings(
        snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
      );
      ready.adminSettings = true;
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'adminSettings/telegram');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    },
  );

  const unsubLogs = onSnapshot(
    collection(db, 'telegramLogs'),
    (snap) => {
      telegramLogs = snap.docs.map((d) =>
        mapTelegramLogDoc(d.id, d.data() as Record<string, unknown>),
      );
      ready.logs = true;
      emit();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'telegramLogs');
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    },
  );

  return () => {
    unsubProducts();
    unsubOrders();
    unsubPublicSettings();
    unsubAdminSettings();
    unsubLogs();
  };
}

/**
 * Real-time PII-free subscription for a buyer's individual order status.
 * Fires instantaneously when Admin sends bank details or marks PAID from any device.
 */
export function subscribeOrderStatus(
  orderId: string,
  onStatus: (statusDoc: OrderStatusSnapshot | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = `orderStatuses/${orderId}`;
  return onSnapshot(
    doc(db, 'orderStatuses', orderId),
    (snap) => {
      if (!snap.exists()) {
        onStatus(null);
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      onStatus({
        orderId: String(raw.orderId || orderId),
        invoiceCode: String(raw.invoiceCode || ''),
        paymentMethod: (raw.paymentMethod as PaymentMethod) || 'telegram_bank',
        status: (raw.status as OrderStatus) || 'PENDING',
        totalAmount: Number(raw.totalAmount || 0),
        adminBankName:
          typeof raw.adminBankName === 'string' ? raw.adminBankName : undefined,
        adminBankNumber:
          typeof raw.adminBankNumber === 'string'
            ? raw.adminBankNumber
            : undefined,
        adminBankHolder:
          typeof raw.adminBankHolder === 'string'
            ? raw.adminBankHolder
            : undefined,
        adminTransferAmount:
          typeof raw.adminTransferAmount === 'number'
            ? raw.adminTransferAmount
            : undefined,
        transferProofNote:
          typeof raw.transferProofNote === 'string'
            ? raw.transferProofNote
            : undefined,
        downloadReady: Boolean(raw.downloadReady),
        createdAt: timestampToIso(raw.createdAt),
        updatedAt: timestampToIso(raw.updatedAt),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    },
  );
}

// =============================================================================
// Admin Mutations (Products, Settings, Orders, Logs)
// =============================================================================

export async function saveFirestoreProduct(
  existingProduct: Product | null,
  payload: {
    title: string;
    slug?: string;
    category: string;
    price: number;
    originalPrice?: number;
    unlimitedStock: boolean;
    stock: number;
    format: string;
    shortDescription: string;
    description: string;
    highlights: string[];
    coverImage: string;
    fileKey: string;
    fileName: string;
    fileSize: string;
    status: 'active' | 'draft';
    featured: boolean;
  },
): Promise<string> {
  const cleanTitle = payload.title.trim().slice(0, 160);
  const cleanSlug =
    (payload.slug || cleanTitle)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 160) || `produk-${Date.now()}`;
  const cleanCategory = payload.category.trim().slice(0, 80) || 'UI Kit & Template';
  const cleanHighlights = payload.highlights
    .map((h) => h.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 20);

  const productId = existingProduct?.id || `prod-${randomHex(8)}`;
  const path = `products/${productId}`;

  try {
    if (existingProduct) {
      await updateDoc(
        doc(db, 'products', productId),
        stripUndefined({
          slug: cleanSlug,
          title: cleanTitle,
          category: cleanCategory,
          price: Math.max(0, Math.round(payload.price)),
          originalPrice:
            payload.originalPrice && payload.originalPrice > 0
              ? Math.round(payload.originalPrice)
              : undefined,
          stock: payload.unlimitedStock ? -1 : Math.max(0, Math.round(payload.stock)),
          unlimitedStock: Boolean(payload.unlimitedStock),
          shortDescription: payload.shortDescription.trim().slice(0, 400),
          description: (payload.description || payload.shortDescription)
            .trim()
            .slice(0, 4000),
          highlights: cleanHighlights,
          format: (payload.format || 'Digital File').trim().slice(0, 80),
          fileSize: (payload.fileSize || '24 KB').trim().slice(0, 40),
          fileName: (payload.fileName || `${cleanSlug}.txt`).trim().slice(0, 200),
          fileKey: (payload.fileKey || `cloud-${cleanSlug}`).trim().slice(0, 200),
          coverImage: (
            payload.coverImage ||
            '/src/assets/images/product_uikit_saas_1795750142065.jpg'
          )
            .trim()
            .slice(0, 500),
          status: payload.status === 'draft' ? 'draft' : 'active',
          featured: Boolean(payload.featured),
          updatedAt: serverTimestamp(),
        }),
      );
    } else {
      await setDoc(
        doc(db, 'products', productId),
        stripUndefined({
          id: productId,
          slug: cleanSlug,
          title: cleanTitle,
          category: cleanCategory,
          price: Math.max(0, Math.round(payload.price)),
          originalPrice:
            payload.originalPrice && payload.originalPrice > 0
              ? Math.round(payload.originalPrice)
              : undefined,
          stock: payload.unlimitedStock ? -1 : Math.max(0, Math.round(payload.stock)),
          unlimitedStock: Boolean(payload.unlimitedStock),
          shortDescription: payload.shortDescription.trim().slice(0, 400),
          description: (payload.description || payload.shortDescription)
            .trim()
            .slice(0, 4000),
          highlights: cleanHighlights,
          format: (payload.format || 'Digital File').trim().slice(0, 80),
          fileSize: (payload.fileSize || '24 KB').trim().slice(0, 40),
          fileName: (payload.fileName || `${cleanSlug}.txt`).trim().slice(0, 200),
          fileKey: (payload.fileKey || `cloud-${cleanSlug}`).trim().slice(0, 200),
          coverImage: (
            payload.coverImage ||
            '/src/assets/images/product_uikit_saas_1795750142065.jpg'
          )
            .trim()
            .slice(0, 500),
          status: payload.status === 'draft' ? 'draft' : 'active',
          featured: Boolean(payload.featured),
          salesCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
    }

    // Ensure new category is registered in /publicSettings/store
    const pubSnap = await getDoc(doc(db, 'publicSettings', 'store'));
    if (pubSnap.exists()) {
      const current = normalizePublicSettings(pubSnap.data() as Record<string, unknown>);
      if (!current.categories.includes(cleanCategory) && current.categories.length < 30) {
        await updateDoc(doc(db, 'publicSettings', 'store'), {
          categories: [...current.categories, cleanCategory],
          updatedAt: serverTimestamp(),
        });
      }
    }

    return productId;
  } catch (error) {
    handleFirestoreError(
      error,
      existingProduct ? OperationType.UPDATE : OperationType.CREATE,
      path,
    );
  }
}

export async function adjustFirestoreProductStock(
  productId: string,
  nextStock: number,
): Promise<void> {
  const path = `products/${productId}`;
  try {
    await updateDoc(doc(db, 'products', productId), {
      stock: Math.max(0, Math.round(nextStock)),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreProduct(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveFirestorePublicSettings(patch: {
  theme?: ThemeConfig;
  seo?: SeoConfig;
  payment?: PaymentSettings;
  categories?: string[];
  resetTheme?: boolean;
}): Promise<StoreSettings> {
  const path = 'publicSettings/store';
  try {
    const snap = await getDoc(doc(db, 'publicSettings', 'store'));
    const current = normalizePublicSettings(
      snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
    );
    const defaults = getDefaultStaticSettings();

    const nextTheme = patch.resetTheme
      ? defaults.theme
      : patch.theme
        ? { ...current.theme, ...patch.theme }
        : current.theme;
    const nextSeo = patch.seo ? { ...current.seo, ...patch.seo } : current.seo;
    const nextPayment = patch.payment
      ? { ...current.payment, ...patch.payment }
      : current.payment;
    const nextCategories =
      patch.categories && patch.categories.length > 0
        ? patch.categories
        : current.categories;

    await setDoc(doc(db, 'publicSettings', 'store'), {
      theme: nextTheme,
      seo: nextSeo,
      payment: nextPayment,
      categories: nextCategories,
      updatedAt: serverTimestamp(),
    });

    return {
      theme: nextTheme,
      seo: nextSeo,
      payment: nextPayment,
      categories: nextCategories,
      telegram: defaults.telegram,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveFirestoreAdminSettings(
  prefs: TelegramPreferences,
): Promise<void> {
  const path = 'adminSettings/telegram';
  try {
    await setDoc(doc(db, 'adminSettings', 'telegram'), {
      notifyOnOrderCreated: Boolean(prefs.notifyOnOrderCreated),
      notifyOnOrderPaid: Boolean(prefs.notifyOnOrderPaid),
      notifyOnLowStock: Boolean(prefs.notifyOnLowStock),
      lowStockThreshold: Math.min(100, Math.max(1, Math.round(prefs.lowStockThreshold || 5))),
      customChatIdOverride: prefs.customChatIdOverride.trim().slice(0, 64),
      messageHeader: prefs.messageHeader.trim().slice(0, 160),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function appendFirestoreTelegramLog(log: {
  event: TelegramLog['event'];
  orderId?: string;
  status: TelegramLog['status'];
  detail: string;
  preview: string;
}): Promise<void> {
  const logId = `log-${Date.now()}-${randomHex(4)}`;
  const path = `telegramLogs/${logId}`;
  try {
    await setDoc(
      doc(db, 'telegramLogs', logId),
      stripUndefined({
        id: logId,
        timestamp: serverTimestamp(),
        event: log.event,
        orderId: log.orderId ? log.orderId.slice(0, 128) : undefined,
        status: log.status,
        detail: log.detail.slice(0, 300),
        preview: log.preview.slice(0, 1500),
      }),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// =============================================================================
// Buyer & Admin Real-Time Order Lifecycle Mutations
// =============================================================================

export async function createFirestoreOrder(params: {
  invoiceCode?: string;
  paymentReference?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  totalAmount: number;
  telegramMeta?: {
    status: Order['telegramStatus'];
    detail?: string;
    messageId?: number;
  };
}): Promise<{ order: Order; buyerSecret: string }> {
  const orderId = `ord-${randomHex(10)}`;
  const buyerSecret = randomHex(16); // 32-char secret held strictly by creating buyer session
  const invoiceCode = (
    params.invoiceCode ||
    `INV-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`
  )
    .trim()
    .slice(0, 64);
  const initialStatus: OrderStatus =
    params.paymentMethod === 'telegram_bank' ? 'AWAITING_BANK' : 'PENDING';
  const paymentReference = (
    params.paymentReference ||
    `${params.paymentMethod.toUpperCase()}-${Math.floor(10000000 + Math.random() * 89999999)}`
  )
    .trim()
    .slice(0, 128);
  const downloadToken = `dl-${randomHex(12)}`;

  const batch = writeBatch(db);

  batch.set(
    doc(db, 'orders', orderId),
    stripUndefined({
      id: orderId,
      invoiceCode,
      buyerSecret,
      customerName: params.customerName.trim().slice(0, 120),
      customerEmail: params.customerEmail.trim().slice(0, 160),
      customerPhone: params.customerPhone.trim().slice(0, 64),
      paymentMethod: params.paymentMethod,
      paymentReference,
      items: params.items.slice(0, 20),
      totalAmount: Math.max(0, Math.round(params.totalAmount)),
      status: initialStatus,
      downloadToken,
      telegramStatus: params.telegramMeta?.status || 'pending',
      telegramMessage: params.telegramMeta?.detail
        ? params.telegramMeta.detail.slice(0, 500)
        : undefined,
      telegramOrderMessageId:
        typeof params.telegramMeta?.messageId === 'number'
          ? params.telegramMeta.messageId
          : undefined,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  batch.set(doc(db, 'orderStatuses', orderId), {
    orderId,
    invoiceCode,
    paymentMethod: params.paymentMethod,
    status: initialStatus,
    totalAmount: Math.max(0, Math.round(params.totalAmount)),
    downloadReady: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}`);
  }

  const nowIso = new Date().toISOString();
  return {
    buyerSecret,
    order: {
      id: orderId,
      invoiceCode,
      customerName: params.customerName.trim(),
      customerEmail: params.customerEmail.trim(),
      customerPhone: params.customerPhone.trim(),
      paymentMethod: params.paymentMethod,
      paymentReference,
      items: params.items,
      totalAmount: Math.max(0, Math.round(params.totalAmount)),
      status: initialStatus,
      downloadToken,
      telegramStatus: params.telegramMeta?.status || 'pending',
      telegramMessage: params.telegramMeta?.detail,
      telegramOrderMessageId: params.telegramMeta?.messageId,
      createdAt: nowIso,
    },
  };
}

/**
 * Buyer-side atomic sync when Admin replies with bank details in Telegram chat.
 * Guarded by single-use buyerSecret capability proof (`bankSyncSecret`).
 */
export async function syncFirestoreBankFromTelegram(
  orderId: string,
  buyerSecret: string,
  bank: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    amount: number;
  },
): Promise<void> {
  const batch = writeBatch(db);
  const cleanBank = bank.bankName.trim().slice(0, 80);
  const cleanNumber = bank.accountNumber.trim().slice(0, 40);
  const cleanHolder = bank.accountHolder.trim().slice(0, 120);
  const cleanAmount = Math.max(0, Math.round(bank.amount));

  batch.update(doc(db, 'orders', orderId), {
    status: 'PENDING',
    adminBankName: cleanBank,
    adminBankNumber: cleanNumber,
    adminBankHolder: cleanHolder,
    adminTransferAmount: cleanAmount,
    bankSyncSecret: buyerSecret,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'orderStatuses', orderId), {
    status: 'PENDING',
    adminBankName: cleanBank,
    adminBankNumber: cleanNumber,
    adminBankHolder: cleanHolder,
    adminTransferAmount: cleanAmount,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

/**
 * Buyer-side atomic submission of transfer proof note (`PENDING` -> `PAYMENT_SUBMITTED`).
 * Guarded by single-use buyerSecret capability proof (`transferSyncSecret`).
 */
export async function submitFirestoreTransferProof(
  orderId: string,
  buyerSecret: string,
  transferProofNote: string,
  telegramMeta?: {
    status?: Order['telegramStatus'];
    detail?: string;
    messageId?: number;
  },
): Promise<void> {
  const batch = writeBatch(db);
  const cleanProof = transferProofNote.trim().slice(0, 200);

  batch.update(
    doc(db, 'orders', orderId),
    stripUndefined({
      status: 'PAYMENT_SUBMITTED',
      transferProofNote: cleanProof,
      telegramStatus: telegramMeta?.status,
      telegramMessage: telegramMeta?.detail
        ? telegramMeta.detail.slice(0, 500)
        : undefined,
      telegramTransferMessageId:
        typeof telegramMeta?.messageId === 'number'
          ? telegramMeta.messageId
          : undefined,
      transferSyncSecret: buyerSecret,
      updatedAt: serverTimestamp(),
    }),
  );

  batch.update(doc(db, 'orderStatuses', orderId), {
    status: 'PAYMENT_SUBMITTED',
    transferProofNote: cleanProof,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

/**
 * Admin sends bank transfer details directly from Dashboard -> instantly appears on Buyer's screen.
 */
export async function adminSendFirestoreBankDetails(
  orderId: string,
  currentStatus: OrderStatus,
  bank: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    amount: number;
  },
): Promise<void> {
  const nextStatus: OrderStatus =
    currentStatus === 'AWAITING_BANK' ? 'PENDING' : currentStatus;
  const cleanBank = bank.bankName.trim().slice(0, 80);
  const cleanNumber = bank.accountNumber.trim().slice(0, 40);
  const cleanHolder = bank.accountHolder.trim().slice(0, 120);
  const cleanAmount = Math.max(0, Math.round(bank.amount));

  const batch = writeBatch(db);

  batch.update(doc(db, 'orders', orderId), {
    status: nextStatus,
    adminBankName: cleanBank,
    adminBankNumber: cleanNumber,
    adminBankHolder: cleanHolder,
    adminTransferAmount: cleanAmount,
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'orderStatuses', orderId), {
    status: nextStatus,
    adminBankName: cleanBank,
    adminBankNumber: cleanNumber,
    adminBankHolder: cleanHolder,
    adminTransferAmount: cleanAmount,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}

/**
 * Admin verifies payment as PAID -> unlocks Buyer's download screen in real time & updates product stock/sales.
 */
export async function adminConfirmFirestoreOrderPaid(
  order: Order,
  telegramMeta?: {
    status?: Order['telegramStatus'];
    detail?: string;
  },
): Promise<void> {
  const batch = writeBatch(db);

  batch.update(
    doc(db, 'orders', order.id),
    stripUndefined({
      status: 'PAID',
      paidAt: serverTimestamp(),
      telegramStatus: telegramMeta?.status || order.telegramStatus,
      telegramMessage: telegramMeta?.detail
        ? telegramMeta.detail.slice(0, 500)
        : order.telegramMessage,
      updatedAt: serverTimestamp(),
    }),
  );

  batch.update(doc(db, 'orderStatuses', order.id), {
    status: 'PAID',
    downloadReady: true,
    updatedAt: serverTimestamp(),
  });

  // Update salesCount and limited stock on purchased products
  if (order.status !== 'PAID') {
    for (const item of order.items) {
      try {
        const prodSnap = await getDoc(doc(db, 'products', item.productId));
        if (prodSnap.exists()) {
          const data = prodSnap.data() as Record<string, unknown>;
          const currentSales = Number(data.salesCount || 0);
          const unlimited = Boolean(data.unlimitedStock);
          const currentStock = Number(data.stock ?? -1);
          batch.update(doc(db, 'products', item.productId), {
            salesCount: currentSales + item.quantity,
            stock: unlimited ? -1 : Math.max(0, currentStock - item.quantity),
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Skip deleted products gracefully
      }
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
  }
}

/**
 * Admin cancels an order -> instantly notifies Buyer's checkout screen via onSnapshot.
 */
export async function adminCancelFirestoreOrder(orderId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'orders', orderId), {
    status: 'CANCELLED',
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'orderStatuses', orderId), {
    status: 'CANCELLED',
    downloadReady: false,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
  }
}
