import type {
  AdminOverviewPayload,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentSettings,
  Product,
  StoreSettings,
  StorefrontPayload,
  TelegramLog,
} from '../types/store';

interface StaticStoreDatabase {
  products: Product[];
  orders: Order[];
  settings: StoreSettings;
  telegramLogs: TelegramLog[];
}

const STORAGE_KEY = 'karsa_digital_static_store_v1';

export interface VercelBankConfig {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  bankOnlyMode: boolean;
}

export function getDefaultStaticPaymentSettings(): PaymentSettings {
  return {
    provider: 'builtin_auto',
    merchantName: 'Karsa Digital Studio',
    qrisMerchantId: 'ID1026384920192',
    qrisImageUrl: '',
    expiryMinutes: 30,
    autoConfirmDemo: true,
    methods: [
      {
        id: 'telegram_bank',
        label: 'Transfer Bank via Konfirmasi Telegram',
        description: 'Admin akan mengirim Nama Bank, Nomor Rekening, & Nominal langsung dari Telegram ke layar ini',
        enabled: true,
        accountNumber: '',
        accountHolder: '',
      },
      {
        id: 'bank_transfer',
        label: 'Transfer Rekening Bank (Tetap)',
        description: 'Transfer langsung ke nomor rekening tetap pemilik toko',
        enabled: false,
        accountNumber: '1234567890',
        accountHolder: 'Nama Pemilik Rekening',
      },
      {
        id: 'qris',
        label: 'QRIS Otomatis',
        description: 'Verifikasi instan semua e-wallet & m-banking Indonesia',
        enabled: false,
        accountNumber: 'ID1026384920192',
        accountHolder: 'Karsa Digital Studio',
      },
      {
        id: 'va_bca',
        label: 'Virtual Account BCA',
        description: 'Konfirmasi otomatis tanpa unggah bukti transfer',
        enabled: false,
        accountNumber: '8801081290441120',
        accountHolder: 'PT Karsa Digital Nusantara',
      },
      {
        id: 'va_mandiri',
        label: 'Virtual Account Mandiri',
        description: 'Nomor VA unik untuk pesanan ini',
        enabled: false,
        accountNumber: '8950808129044112',
        accountHolder: 'PT Karsa Digital Nusantara',
      },
      {
        id: 'ewallet_gopay',
        label: 'GoPay Instan',
        description: 'Pembayaran langsung dari aplikasi Gojek',
        enabled: false,
        accountNumber: '081290441120',
        accountHolder: 'Karsa Digital',
      },
      {
        id: 'ewallet_dana',
        label: 'DANA Instan',
        description: 'Bebas biaya administrasi tambahan',
        enabled: false,
        accountNumber: '081290441120',
        accountHolder: 'Karsa Digital',
      },
    ],
  };
}

export function getDefaultStaticSettings(): StoreSettings {
  return {
    theme: {
      storeName: 'Karsa Digital',
      heroEyebrow: 'Katalog Produk Digital Terkurasi',
      heroHeadline: 'Aset digital siap pakai untuk mempercepat peluncuran proyek Anda.',
      heroSubheadline:
        'Template antarmuka, panduan SEO modern, dan starter kit kode yang dirancang rapi. Pembayaran otomatis, pengiriman file instan, dan pembaruan gratis seumur hidup.',
      heroCtaText: 'Jelajahi Katalog',
      heroImage: '/src/assets/images/hero_digital_studio_1795750140666.jpg',
      accentColor: '#1D4ED8',
      defaultMode: 'light',
      cornerStyle: 'modern',
      gridColumns: 3,
      contactEmail: 'halo@karsadigital.id',
      footerNotice: 'Lisensi komersial resmi untuk kreator, agensi, dan tim produk.',
      socialLinks: {
        youtube: '',
        tiktok: '',
        instagram: '',
        whatsapp: '',
      },
      uiTexts: {
        navCatalog: 'Katalog',
        navFeatures: 'Keunggulan',
        navCart: 'Keranjang',
        catalogTitle: 'Katalog Produk Digital',
        catalogSubtitle:
          'Semua produk dilengkapi pembaruan berkala, manajemen stok otomatis, dan tautan unduhan instan setelah pembayaran.',
        featuresTitle: 'Infrastruktur toko digital yang cepat, otomatis, dan siap tumbuh.',
        featuresSubtitle:
          'Dirancang agar pemilik produk bisa mengatur katalog, tampilan visual, stok, serta notifikasi pesanan tanpa menulis ulang kode.',
        buyButtonText: 'Beli',
        detailButtonText: 'Detail',
      },
    },
    seo: {
      metaTitle: 'Karsa Digital — Katalog Produk Digital & Toko Otomatis',
      metaDescription:
        'Jelajahi template UI, e-book strategis, dan kit kode siap pakai dengan pembayaran otomatis, pengiriman file instan, serta optimasi SEO modern.',
      keywords:
        'produk digital, template UI, e-book SEO, starter kit toko digital, QRIS otomatis, aset desain',
      canonicalUrl: 'https://karsadigital.vercel.app',
      ogSiteName: 'Karsa Digital',
    },
    telegram: {
      notifyOnOrderCreated: true,
      notifyOnOrderPaid: true,
      notifyOnLowStock: true,
      lowStockThreshold: 5,
      customChatIdOverride: '',
      messageHeader: 'Notifikasi Pesanan Karsa Digital',
    },
    payment: getDefaultStaticPaymentSettings(),
    categories: ['UI Kit & Template', 'E-Book & Panduan', 'Source Code', 'Aset Desain'],
  };
}

function getDefaultStaticDb(): StaticStoreDatabase {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();

  return {
    products: [
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
        fileKey: 'static-uikit',
        coverImage: '/src/assets/images/product_uikit_saas_1795750142065.jpg',
        status: 'active',
        featured: true,
        salesCount: 64,
        createdAt: yesterday,
        updatedAt: now,
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
        fileKey: 'static-ebook',
        coverImage: '/src/assets/images/product_ebook_seo_1795750142064.jpg',
        status: 'active',
        featured: true,
        salesCount: 112,
        createdAt: yesterday,
        updatedAt: now,
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
        fileKey: 'static-code',
        coverImage: '/src/assets/images/product_code_starter_1795750142604.jpg',
        status: 'active',
        featured: true,
        salesCount: 41,
        createdAt: yesterday,
        updatedAt: now,
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
        fileKey: 'static-brand',
        coverImage: '/src/assets/images/product_brand_templates_1795750143149.jpg',
        status: 'active',
        featured: false,
        salesCount: 29,
        createdAt: yesterday,
        updatedAt: now,
      },
    ],
    orders: [
      {
        id: 'ord-static-1001',
        invoiceCode: 'INV-2026-1001',
        customerName: 'Raka Pratama',
        customerEmail: 'raka.pratama@studioarsip.id',
        customerPhone: '081290441120',
        paymentMethod: 'qris',
        paymentReference: 'QRIS-88291044',
        items: [
          {
            productId: 'prod-uikit-01',
            title: 'Nusantara UI — Sistem Desain SaaS & Dashboard',
            price: 249000,
            quantity: 1,
            fileName: 'Nusantara-UI-Design-System.txt',
          },
        ],
        totalAmount: 249000,
        status: 'PAID',
        downloadToken: 'static-local-token',
        telegramStatus: 'not_configured',
        telegramMessage: 'Mode Statis (GitHub Pages) — aktifkan server Node.js untuk notifikasi Telegram.',
        createdAt: yesterday,
        paidAt: yesterday,
      },
    ],
    settings: getDefaultStaticSettings(),
    telegramLogs: [],
  };
}

export function loadStaticDb(): StaticStoreDatabase {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultStaticDb();
    const parsed = JSON.parse(raw) as Partial<StaticStoreDatabase>;
    const defaults = getDefaultStaticDb();
    return {
      products: Array.isArray(parsed.products) ? parsed.products : defaults.products,
      orders: Array.isArray(parsed.orders) ? parsed.orders : defaults.orders,
      settings: {
        theme: { ...defaults.settings.theme, ...(parsed.settings?.theme ?? {}) },
        seo: { ...defaults.settings.seo, ...(parsed.settings?.seo ?? {}) },
        telegram: { ...defaults.settings.telegram, ...(parsed.settings?.telegram ?? {}) },
        payment: {
          ...defaults.settings.payment,
          ...(parsed.settings?.payment ?? {}),
          methods:
            Array.isArray(parsed.settings?.payment?.methods) &&
            parsed.settings.payment.methods.length > 0
              ? parsed.settings.payment.methods.some((m) => m.id === 'telegram_bank')
                ? parsed.settings.payment.methods
                : [
                    defaults.settings.payment.methods[0],
                    ...parsed.settings.payment.methods.map((m) => ({ ...m, enabled: false })),
                  ]
              : defaults.settings.payment.methods,
        },
        categories:
          Array.isArray(parsed.settings?.categories) && parsed.settings.categories.length > 0
            ? parsed.settings.categories
            : defaults.settings.categories,
      },
      telegramLogs: Array.isArray(parsed.telegramLogs) ? parsed.telegramLogs : [],
    };
  } catch {
    return getDefaultStaticDb();
  }
}

export function saveStaticDb(db: StaticStoreDatabase): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Ignore storage quota errors in restricted frames
  }
}

export function applyVercelBankConfig(
  payment: PaymentSettings,
  bankConfig?: VercelBankConfig | null,
): PaymentSettings {
  if (!bankConfig || !bankConfig.accountNumber) return payment;
  const label = bankConfig.bankName.toLowerCase().includes('bank')
    ? bankConfig.bankName
    : `Transfer Bank ${bankConfig.bankName}`;
  return {
    ...payment,
    merchantName: bankConfig.accountHolder || payment.merchantName,
    methods: payment.methods.map((m) => {
      if (m.id === 'bank_transfer') {
        return {
          ...m,
          label,
          enabled: true,
          accountNumber: bankConfig.accountNumber,
          accountHolder: bankConfig.accountHolder || m.accountHolder,
        };
      }
      return bankConfig.bankOnlyMode ? { ...m, enabled: false } : m;
    }),
  };
}

export function getStaticStorefrontPayload(
  bankConfig?: VercelBankConfig | null,
): StorefrontPayload {
  const db = loadStaticDb();
  const activeProducts = db.products.filter((p) => p.status === 'active');
  return {
    products: activeProducts,
    settings: {
      theme: db.settings.theme,
      seo: db.settings.seo,
      payment: applyVercelBankConfig(db.settings.payment, bankConfig),
      categories: db.settings.categories,
    },
    stats: {
      totalProducts: activeProducts.length,
      totalCategories: db.settings.categories.length,
      completedOrders: db.orders.filter((o) => o.status === 'PAID').length,
    },
  };
}

export function getStaticAdminOverview(serverlessHealth?: {
  telegramBotConfigured?: boolean;
  telegramChatConfigured?: boolean;
  midtransConfigured?: boolean;
  webhookSecretConfigured?: boolean;
  paymentMode?: 'production' | 'sandbox';
  bankConfig?: VercelBankConfig | null;
}): AdminOverviewPayload {
  const db = loadStaticDb();
  const threshold = db.settings.telegram.lowStockThreshold ?? 5;
  const paidOrders = db.orders.filter((o) => o.status === 'PAID');
  const pendingOrders = db.orders.filter(
    (o) => o.status === 'PENDING' || o.status === 'AWAITING_BANK' || o.status === 'PAYMENT_SUBMITTED',
  );
  const activeProducts = db.products.filter((p) => p.status === 'active');
  const lowStockProducts = activeProducts.filter(
    (p) => !p.unlimitedStock && p.stock <= threshold,
  );

  return {
    products: db.products,
    orders: db.orders,
    settings: {
      ...db.settings,
      payment: applyVercelBankConfig(db.settings.payment, serverlessHealth?.bankConfig),
    },
    telegramStatus: {
      botTokenConfigured: Boolean(serverlessHealth?.telegramBotConfigured),
      envChatIdConfigured: Boolean(serverlessHealth?.telegramChatConfigured),
      effectiveChatIdMasked: serverlessHealth?.telegramChatConfigured ? 'Terpasang di Vercel' : null,
    },
    paymentStatus: {
      midtransConfigured: Boolean(serverlessHealth?.midtransConfigured),
      webhookSecretConfigured: Boolean(serverlessHealth?.webhookSecretConfigured),
      mode: serverlessHealth?.paymentMode || 'sandbox',
    },
    telegramLogs: db.telegramLogs,
    mediaAssets: [],
    metrics: {
      totalRevenue: paidOrders.reduce((sum, o) => sum + o.totalAmount, 0),
      paidOrdersCount: paidOrders.length,
      pendingOrdersCount: pendingOrders.length,
      activeProductsCount: activeProducts.length,
      lowStockProductsCount: lowStockProducts.length,
    },
  };
}

export function appendStaticTelegramLog(log: TelegramLog): void {
  const db = loadStaticDb();
  db.telegramLogs.unshift(log);
  if (db.telegramLogs.length > 50) {
    db.telegramLogs = db.telegramLogs.slice(0, 50);
  }
  saveStaticDb(db);
}

export function createStaticOrder(params: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  items: Array<{ productId: string; quantity: number }>;
}): Order {
  const db = loadStaticDb();
  const resolvedItems: OrderItem[] = [];
  let totalAmount = 0;

  for (const entry of params.items) {
    const product = db.products.find((p) => p.id === entry.productId && p.status === 'active');
    if (!product) throw new Error('Produk tidak ditemukan.');
    if (!product.unlimitedStock && product.stock < entry.quantity) {
      throw new Error(`Stok "${product.title}" hanya tersisa ${product.stock} unit.`);
    }
    if (!product.unlimitedStock) {
      product.stock = Math.max(0, product.stock - entry.quantity);
    }
    resolvedItems.push({
      productId: product.id,
      title: product.title,
      price: product.price,
      quantity: entry.quantity,
      fileName: product.fileName,
    });
    totalAmount += product.price * entry.quantity;
  }

  const invoiceCode = `INV-${new Date().getFullYear()}-${1001 + db.orders.length}`;
  const order: Order = {
    id: `ord-static-${Date.now()}`,
    invoiceCode,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    customerPhone: params.customerPhone,
    paymentMethod: params.paymentMethod,
    paymentReference: `${params.paymentMethod.toUpperCase()}-${Math.floor(10000000 + Math.random() * 89999999)}`,
    items: resolvedItems,
    totalAmount,
    status: params.paymentMethod === 'telegram_bank' ? 'AWAITING_BANK' : 'PENDING',
    downloadToken: `static-${Date.now()}`,
    telegramStatus: 'not_configured',
    telegramMessage: 'Menunggu pengiriman notifikasi Telegram...',
    createdAt: new Date().toISOString(),
  };

  db.orders.unshift(order);
  saveStaticDb(db);
  return order;
}

export function updateStaticOrder(orderId: string, patch: Partial<Order>): Order | null {
  const db = loadStaticDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return null;
  Object.assign(order, patch);
  saveStaticDb(db);
  return { ...order };
}

export function confirmStaticOrderPayment(orderId: string): Order {
  const db = loadStaticDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new Error('Pesanan tidak ditemukan.');
  if (order.status !== 'PAID') {
    order.status = 'PAID';
    order.paidAt = new Date().toISOString();
    for (const item of order.items) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) prod.salesCount += item.quantity;
    }
    saveStaticDb(db);
  }
  return order;
}

export function triggerStaticLicenseDownload(order: Order, item: OrderItem): void {
  const content = [
    'KARSA DIGITAL — LISENSI RESMI PRODUK DIGITAL',
    `Invoice: ${order.invoiceCode}`,
    `Pembeli: ${order.customerName} (${order.customerEmail})`,
    `Produk: ${item.title}`,
    `Tanggal Lunas: ${order.paidAt || order.createdAt}`,
    '',
    'Terima kasih telah berbelanja di Karsa Digital.',
  ].join('\n');

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = item.fileName || 'lisensi-produk-digital.txt';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function saveStaticProduct(
  productId: string | null,
  payload: Partial<Product>,
): Product {
  const db = loadStaticDb();
  const now = new Date().toISOString();

  if (productId) {
    const existing = db.products.find((p) => p.id === productId);
    if (!existing) throw new Error('Produk tidak ditemukan.');
    Object.assign(existing, payload, { updatedAt: now });
    if (existing.category && !db.settings.categories.includes(existing.category)) {
      db.settings.categories.push(existing.category);
    }
    saveStaticDb(db);
    return existing;
  }

  const title = (payload.title || 'Produk Digital Baru').trim();
  const slug =
    (payload.slug || title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `produk-${Date.now()}`;

  const created: Product = {
    id: `prod-static-${Date.now()}`,
    slug,
    title,
    category: payload.category || db.settings.categories[0] || 'UI Kit & Template',
    price: Number(payload.price || 0),
    originalPrice: payload.originalPrice,
    stock: payload.unlimitedStock ? -1 : Math.max(0, Number(payload.stock ?? 10)),
    unlimitedStock: Boolean(payload.unlimitedStock),
    shortDescription: payload.shortDescription || '',
    description: payload.description || payload.shortDescription || '',
    highlights: payload.highlights || [],
    format: payload.format || 'Digital File',
    fileSize: payload.fileSize || '24 KB',
    fileName: payload.fileName || `${slug}.txt`,
    fileKey: payload.fileKey || `static-${slug}`,
    coverImage:
      payload.coverImage || '/src/assets/images/product_uikit_saas_1795750142065.jpg',
    status: payload.status === 'draft' ? 'draft' : 'active',
    featured: Boolean(payload.featured),
    salesCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (!db.settings.categories.includes(created.category)) {
    db.settings.categories.push(created.category);
  }
  db.products.unshift(created);
  saveStaticDb(db);
  return created;
}

export function deleteStaticProduct(productId: string): void {
  const db = loadStaticDb();
  db.products = db.products.filter((p) => p.id !== productId);
  saveStaticDb(db);
}

export function updateStaticOrderStatus(orderId: string, status: Order['status']): void {
  const db = loadStaticDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return;
  order.status = status;
  if (status === 'PAID' && !order.paidAt) {
    order.paidAt = new Date().toISOString();
  }
  saveStaticDb(db);
}

export function saveStaticSettings(payload: {
  theme?: Partial<StoreSettings['theme']>;
  seo?: Partial<StoreSettings['seo']>;
  telegram?: Partial<StoreSettings['telegram']>;
  payment?: Partial<StoreSettings['payment']>;
  resetTheme?: boolean;
}): StoreSettings {
  const db = loadStaticDb();
  if (payload.resetTheme) {
    db.settings.theme = getDefaultStaticSettings().theme;
  } else if (payload.theme) {
    db.settings.theme = { ...db.settings.theme, ...payload.theme };
  }
  if (payload.seo) {
    db.settings.seo = { ...db.settings.seo, ...payload.seo };
  }
  if (payload.telegram) {
    db.settings.telegram = { ...db.settings.telegram, ...payload.telegram };
  }
  if (payload.payment) {
    db.settings.payment = { ...db.settings.payment, ...payload.payment };
  }
  saveStaticDb(db);
  return db.settings;
}
