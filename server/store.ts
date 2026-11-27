import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  Order,
  PaymentSettings,
  Product,
  StoreSettings,
  TelegramLog,
} from '../src/types/store.js';

export interface AdminAuthRecord {
  salt: string;
  hash: string;
  claimedAt: string;
}

export interface StoreDatabase {
  products: Product[];
  orders: Order[];
  settings: StoreSettings;
  telegramLogs: TelegramLog[];
  adminAuth: AdminAuthRecord | null;
}

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const STORE_FILE = path.resolve(DATA_DIR, 'store.json');

export function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function createSeedFile(fileKey: string, content: string): string {
  const safeKey = path.basename(fileKey);
  const target = path.resolve(UPLOADS_DIR, safeKey);
  if (!target.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Invalid seed file path');
  }
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, content, 'utf8');
  }
  const stat = fs.statSync(target);
  return `${Math.max(1, Math.round(stat.size / 1024))} KB`;
}

export function getDefaultPaymentSettings(): PaymentSettings {
  return {
    provider: 'builtin_auto',
    merchantName: 'Karsa Digital Studio',
    qrisMerchantId: 'ID1026384920192',
    qrisImageUrl: '',
    expiryMinutes: 30,
    autoConfirmDemo: true,
    methods: [
      {
        id: 'qris',
        label: 'QRIS Otomatis',
        description: 'Verifikasi instan semua e-wallet & m-banking Indonesia',
        enabled: true,
        accountNumber: 'ID1026384920192',
        accountHolder: 'Karsa Digital Studio',
      },
      {
        id: 'va_bca',
        label: 'Virtual Account BCA',
        description: 'Konfirmasi otomatis tanpa unggah bukti transfer',
        enabled: true,
        accountNumber: '8801081290441120',
        accountHolder: 'PT Karsa Digital Nusantara',
      },
      {
        id: 'va_mandiri',
        label: 'Virtual Account Mandiri',
        description: 'Nomor VA unik untuk pesanan ini',
        enabled: true,
        accountNumber: '8950808129044112',
        accountHolder: 'PT Karsa Digital Nusantara',
      },
      {
        id: 'ewallet_gopay',
        label: 'GoPay Instan',
        description: 'Pembayaran langsung dari aplikasi Gojek',
        enabled: true,
        accountNumber: '081290441120',
        accountHolder: 'Karsa Digital',
      },
      {
        id: 'ewallet_dana',
        label: 'DANA Instan',
        description: 'Bebas biaya administrasi tambahan',
        enabled: true,
        accountNumber: '081290441120',
        accountHolder: 'Karsa Digital',
      },
    ],
  };
}

export function getDefaultSettings(): StoreSettings {
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
    payment: getDefaultPaymentSettings(),
    categories: [
      'UI Kit & Template',
      'E-Book & Panduan',
      'Source Code',
      'Aset Desain',
    ],
  };
}

function createInitialDatabase(): StoreDatabase {
  ensureDataDirs();

  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();

  const file1Size = createSeedFile(
    'seed-nusantara-ui-kit.txt',
    [
      'KARSA DIGITAL — LISENSI RESMI PRODUK DIGITAL',
      'Produk: Nusantara UI — Sistem Desain SaaS & Dashboard',
      'Versi: 2.4 (Kompatibel Figma Auto-Layout 5 & Tailwind CSS v4)',
      '',
      'Isi Paket:',
      '- 140+ Komponen Antarmuka (Mode Terang & Mode Gelap)',
      '- 18 Tata Letak Halaman Dashboard & Analitik',
      '- Token Warna, Tipografi, dan Spasi Terstruktur',
      '- Panduan Dokumentasi & Lisensi Komersial',
      '',
      'Terima kasih telah berbelanja di Karsa Digital.',
    ].join('\n'),
  );

  const file2Size = createSeedFile(
    'seed-panduan-seo-modern.txt',
    [
      'KARSA DIGITAL — E-BOOK & CHECKLIST PRODUKSI',
      'Produk: Panduan Praktis SEO & Performa Web Modern',
      'Edisi: 2026 (185 Halaman + Checklist Audit Teknis)',
      '',
      'Ringkasan Bab:',
      '01. Arsitektur Metadata, OpenGraph, & Schema.org JSON-LD',
      '02. Optimasi Core Web Vitals di Vercel, Netlify, dan GitHub Pages',
      '03. Strategi Sitemap Dinamis & Pengindeksan Cepat Google Search Console',
      '04. Studi Kasus Pertumbuhan Trafik Organik Toko Digital',
    ].join('\n'),
  );

  const file3Size = createSeedFile(
    'seed-starter-toko-digital.txt',
    [
      'KARSA DIGITAL — SOURCE CODE STARTER KIT',
      'Produk: Kit Kode Toko Digital & Checkout Otomatis',
      'Stack: React 19, TypeScript, Tailwind CSS v4, Express API',
      '',
      'Fitur Tersedia:',
      '- Manajemen Katalog & Stok Otomatis',
      '- Alur Checkout QRIS, Virtual Account, & E-Wallet',
      '- Integrasi Webhook & Notifikasi Bot Telegram Real-Time',
      '- Konfigurasi Siap Deploy: vercel.json, netlify.toml, GitHub Pages',
    ].join('\n'),
  );

  const file4Size = createSeedFile(
    'seed-paket-pitch-deck.txt',
    [
      'KARSA DIGITAL — PAKET IDENTITAS VISUAL',
      'Produk: Paket Template Pitch Deck & Identitas Visual',
      'Format: Keynote, Figma Slides, & Panduan Brand Book',
      '',
      'Termasuk:',
      '- 48 Slide Presentasi Investor & Proposal Klien',
      '- Template Brand Guidelines Editorial',
      '- Kartu Nama, Kop Surat, dan Palet Tipografi Siap Cetak',
    ].join('\n'),
  );

  const products: Product[] = [
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
        'Sistem desain lengkap untuk tim produk dan freelancer yang ingin membangun dashboard SaaS, portal admin, dan landing page berstandar produksi tanpa memulai dari nol. Setiap komponen dirancang dengan kontras WCAG AA, angka tabular untuk tabel finansial, dan struktur auto-layout yang konsisten.',
      highlights: [
        '140+ komponen responsif dengan varian Light & Dark Mode',
        '18 halaman siap pakai: Analitik, Pesanan, Editor, dan Pengaturan',
        'Token warna, spasi, dan tipografi selaras Tailwind CSS v4',
        'Lisensi komersial untuk proyek klien tanpa batas',
      ],
      format: 'FIG + Token JSON',
      fileSize: file1Size,
      fileName: 'Nusantara-UI-Design-System.txt',
      fileKey: 'seed-nusantara-ui-kit.txt',
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
        'Disusun berdasarkan studi kasus nyata peluncuran puluhan situs komersial dan toko digital. Membahas secara sistematis cara menyusun struktur heading, metadata sosial OpenGraph, sitemap otomatis, dan audit Core Web Vitals agar situs Anda cepat terindeks di halaman pertama.',
      highlights: [
        '185 halaman materi terstruktur berbahasa Indonesia yang lugas',
        'Template Schema.org JSON-LD untuk Toko Digital & Artikel',
        'Checklist konfigurasi GitHub Pages, Vercel, dan Netlify gratis',
        'Bonus lembar kerja riset kata kunci dan audit halaman',
      ],
      format: 'PDF + Checklist',
      fileSize: file2Size,
      fileName: 'Panduan-SEO-Performa-Web-Modern.txt',
      fileKey: 'seed-panduan-seo-modern.txt',
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
        'Hemat berminggu-minggu waktu pengembangan dengan fondasi kode yang bersih, teruji, dan siap di-deploy. Dilengkapi sistem manajemen stok, pengiriman tautan unduhan aman, serta webhook notifikasi Bot Telegram instan setiap kali pembayaran masuk.',
      highlights: [
        'Kode sumber penuh React 19, TypeScript, Tailwind v4, dan Express',
        'Integrasi notifikasi Bot Telegram real-time tanpa biaya pihak ketiga',
        'Sistem manajemen stok otomatis dan proteksi tautan unduhan',
        'Siap deploy satu klik ke Vercel, Netlify, atau server mandiri',
      ],
      format: 'ZIP Source Code',
      fileSize: file3Size,
      fileName: 'Kit-Kode-Toko-Digital-Otomatis.txt',
      fileKey: 'seed-starter-toko-digital.txt',
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
        'Tingkatkan daya tarik proposal klien dan presentasi pendanaan dengan tata letak editorial yang rapi dan meyakinkan. Dirancang dengan grid proporsional, palet warna netral premium, serta panduan penggantian tipografi yang sangat mudah diikuti.',
      highlights: [
        '48 tata letak slide fleksibel untuk pitch investor & laporan klien',
        'Template Brand Guidelines 24 halaman siap disesuaikan',
        'Kompatibel dengan Figma, Keynote, dan Google Slides',
        'Panduan komposisi warna dan hierarki tipografi profesional',
      ],
      format: 'FIG + Slide Deck',
      fileSize: file4Size,
      fileName: 'Paket-Pitch-Deck-Identitas-Visual.txt',
      fileKey: 'seed-paket-pitch-deck.txt',
      coverImage: '/src/assets/images/product_brand_templates_1795750143149.jpg',
      status: 'active',
      featured: false,
      salesCount: 29,
      createdAt: yesterday,
      updatedAt: now,
    },
  ];

  const sampleOrders: Order[] = [
    {
      id: 'ord-seed-1001',
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
      downloadToken: crypto.randomBytes(24).toString('hex'),
      telegramStatus: 'sent',
      telegramMessage: 'Pesanan #INV-2026-1001 lunas via QRIS Otomatis.',
      createdAt: yesterday,
      paidAt: yesterday,
    },
    {
      id: 'ord-seed-1002',
      invoiceCode: 'INV-2026-1002',
      customerName: 'Nadia Kusuma',
      customerEmail: 'nadia@kreatifmuda.co.id',
      customerPhone: '085611284930',
      paymentMethod: 'va_bca',
      paymentReference: 'BCA-7701293844',
      items: [
        {
          productId: 'prod-ebook-02',
          title: 'Panduan Praktis SEO & Performa Web Modern',
          price: 129000,
          quantity: 1,
          fileName: 'Panduan-SEO-Performa-Web-Modern.txt',
        },
      ],
      totalAmount: 129000,
      status: 'PAID',
      downloadToken: crypto.randomBytes(24).toString('hex'),
      telegramStatus: 'sent',
      telegramMessage: 'Pesanan #INV-2026-1002 lunas via Virtual Account BCA.',
      createdAt: new Date(Date.now() - 14_400_000).toISOString(),
      paidAt: new Date(Date.now() - 14_100_000).toISOString(),
    },
  ];

  const telegramLogs: TelegramLog[] = [
    {
      id: 'tg-seed-1',
      timestamp: yesterday,
      event: 'order_paid',
      orderId: 'ord-seed-1001',
      status: 'sent',
      detail: 'Contoh catatan notifikasi pesanan lunas',
      preview:
        'Notifikasi Pesanan Karsa Digital\nInvoice: INV-2026-1001\nPembeli: Raka Pratama\nTotal: Rp 249.000 (Lunas — QRIS Otomatis)',
    },
  ];

  return {
    products,
    orders: sampleOrders,
    settings: getDefaultSettings(),
    telegramLogs,
    adminAuth: null,
  };
}

let dbCache: StoreDatabase | null = null;

export function loadDatabase(): StoreDatabase {
  if (dbCache) return dbCache;
  ensureDataDirs();

  if (!fs.existsSync(STORE_FILE)) {
    dbCache = createInitialDatabase();
    saveDatabase(dbCache);
    return dbCache;
  }

  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreDatabase>;
    const defaults = getDefaultSettings();
    dbCache = {
      products: Array.isArray(parsed.products) ? parsed.products : createInitialDatabase().products,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      settings: {
        theme: { ...defaults.theme, ...(parsed.settings?.theme ?? {}) },
        seo: { ...defaults.seo, ...(parsed.settings?.seo ?? {}) },
        telegram: { ...defaults.telegram, ...(parsed.settings?.telegram ?? {}) },
        payment: {
          ...defaults.payment,
          ...(parsed.settings?.payment ?? {}),
          methods:
            Array.isArray(parsed.settings?.payment?.methods) &&
            parsed.settings.payment.methods.length > 0
              ? parsed.settings.payment.methods
              : defaults.payment.methods,
        },
        categories:
          Array.isArray(parsed.settings?.categories) && parsed.settings.categories.length > 0
            ? parsed.settings.categories
            : defaults.categories,
      },
      telegramLogs: Array.isArray(parsed.telegramLogs) ? parsed.telegramLogs : [],
      adminAuth: parsed.adminAuth ?? null,
    };
    // Ensure seed files exist if referenced
    for (const p of dbCache.products) {
      if (p.fileKey.startsWith('seed-')) {
        const seedPath = path.resolve(UPLOADS_DIR, path.basename(p.fileKey));
        if (!fs.existsSync(seedPath)) {
          createSeedFile(p.fileKey, `Karsa Digital — Lisensi Resmi untuk ${p.title}\n`);
        }
      }
    }
    return dbCache;
  } catch {
    dbCache = createInitialDatabase();
    saveDatabase(dbCache);
    return dbCache;
  }
}

export function saveDatabase(db: StoreDatabase): void {
  ensureDataDirs();
  dbCache = db;
  const tmpFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, STORE_FILE);
}

export function hashPassword(password: string): AdminAuthRecord {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return {
    salt,
    hash,
    claimedAt: new Date().toISOString(),
  };
}

export function verifyPasswordHash(password: string, record: AdminAuthRecord): boolean {
  const derived = crypto.scryptSync(password, record.salt, 64);
  const expected = Buffer.from(record.hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function verifyEnvPasscode(input: string, envPasscode: string): boolean {
  const inputHash = crypto.createHash('sha256').update(input).digest();
  const expectedHash = crypto.createHash('sha256').update(envPasscode).digest();
  return crypto.timingSafeEqual(inputHash, expectedHash);
}
