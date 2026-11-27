import 'dotenv/config';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type {
  AdminOverviewPayload,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
  StorefrontPayload,
} from './src/types/store.js';
import {
  UPLOADS_DIR,
  ensureDataDirs,
  getDefaultSettings,
  hashPassword,
  loadDatabase,
  saveDatabase,
  verifyEnvPasscode,
  verifyPasswordHash,
} from './server/store.js';
import {
  buildOrderTelegramMessage,
  dispatchTelegramNotification,
  getTelegramConnectionStatus,
  notifyLowStockIfNeeded,
} from './server/telegram.js';

const PORT = 3000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const adminSessions = new Map<string, number>();

const ALLOWED_PRODUCT_EXTENSIONS = new Set([
  '.zip',
  '.pdf',
  '.fig',
  '.json',
  '.txt',
  '.md',
  '.csv',
  '.docx',
  '.xlsx',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

const ALLOWED_COVER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const VALID_PAYMENT_METHODS = new Set<PaymentMethod>([
  'qris',
  'va_bca',
  'va_mandiri',
  'ewallet_gopay',
  'ewallet_dana',
]);

function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || `produk-${Date.now()}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isSafeUrlOrPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function issueSessionToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi admin diperlukan. Silakan masuk terlebih dahulu.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const expiresAt = adminSessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    adminSessions.delete(token);
    res.status(401).json({ error: 'Sesi admin telah berakhir. Silakan masuk kembali.' });
    return;
  }
  next();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildAdminOverview(): AdminOverviewPayload {
  const db = loadDatabase();
  const threshold = db.settings.telegram.lowStockThreshold ?? 5;
  const paidOrders = db.orders.filter((o) => o.status === 'PAID');
  const pendingOrders = db.orders.filter((o) => o.status === 'PENDING');
  const activeProducts = db.products.filter((p) => p.status === 'active');
  const lowStockProducts = activeProducts.filter(
    (p) => !p.unlimitedStock && p.stock <= threshold,
  );

  return {
    products: db.products,
    orders: db.orders,
    settings: db.settings,
    telegramStatus: getTelegramConnectionStatus(db.settings),
    paymentStatus: {
      midtransConfigured: Boolean((process.env.MIDTRANS_SERVER_KEY || '').trim()),
      webhookSecretConfigured: Boolean((process.env.PAYMENT_WEBHOOK_SECRET || '').trim()),
      mode: process.env.MIDTRANS_IS_PRODUCTION === 'true' ? 'production' : 'sandbox',
    },
    telegramLogs: db.telegramLogs,
    metrics: {
      totalRevenue: paidOrders.reduce((acc, o) => acc + o.totalAmount, 0),
      paidOrdersCount: paidOrders.length,
      pendingOrdersCount: pendingOrders.length,
      activeProductsCount: activeProducts.length,
      lowStockProductsCount: lowStockProducts.length,
    },
  };
}

ensureDataDirs();
loadDatabase();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDataDirs();
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
  },
  fileFilter: (req, file, cb) => {
    const kind = String(req.query.kind || 'product');
    const ext = path.extname(file.originalname).toLowerCase();
    const allowlist = kind === 'cover' ? ALLOWED_COVER_EXTENSIONS : ALLOWED_PRODUCT_EXTENSIONS;
    if (!allowlist.has(ext)) {
      cb(new Error(`Format file ${ext || '(tanpa ekstensi)'} tidak diizinkan untuk jenis unggahan ini.`));
      return;
    }
    cb(null, true);
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Basic security headers for API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Dynamic SEO sitemap.xml reflecting live products & canonical URL
  app.get('/sitemap.xml', (_req, res) => {
    const db = loadDatabase();
    const rawBase = db.settings.seo.canonicalUrl || process.env.APP_URL || 'https://karsadigital.vercel.app';
    const baseUrl = isSafeUrlOrPath(rawBase) ? rawBase.replace(/\/+$/, '') : 'https://karsadigital.vercel.app';
    const activeProducts = db.products.filter((p) => p.status === 'active');

    const urls = [
      `  <url>\n    <loc>${baseUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
      `  <url>\n    <loc>${baseUrl}/#katalog</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
      ...activeProducts.map(
        (p) =>
          `  <url>\n    <loc>${baseUrl}/?produk=${encodeURIComponent(p.slug)}</loc>\n    <lastmod>${p.updatedAt.slice(0, 10)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
      ),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    res.type('application/xml').send(xml);
  });

  // Serve uploaded cover images safely (images only, strict path confinement)
  app.get('/api/media/:filename', (req, res) => {
    const safeName = path.basename(String(req.params.filename || ''));
    const ext = path.extname(safeName).toLowerCase();
    if (!ALLOWED_COVER_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: 'Format gambar tidak valid.' });
      return;
    }
    const resolved = path.resolve(UPLOADS_DIR, safeName);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Media tidak ditemukan.' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(resolved);
  });

  // PUBLIC: Storefront payload (active products + public theme/SEO settings)
  app.get('/api/storefront', (_req, res) => {
    const db = loadDatabase();
    const activeProducts = db.products.filter((p) => p.status === 'active');
    const completedOrders = db.orders.filter((o) => o.status === 'PAID').length;

    const payload: StorefrontPayload = {
      products: activeProducts,
      settings: {
        theme: db.settings.theme,
        seo: db.settings.seo,
        payment: db.settings.payment,
        categories: db.settings.categories,
      },
      stats: {
        totalProducts: activeProducts.length,
        totalCategories: db.settings.categories.length,
        completedOrders,
      },
    };
    res.json(payload);
  });

  // PUBLIC: Create order with server-side price calculation and atomic stock check
  app.post('/api/orders', async (req, res) => {
    const db = loadDatabase();
    const { customerName, customerEmail, customerPhone, paymentMethod, items } = req.body as {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      paymentMethod?: PaymentMethod;
      items?: Array<{ productId?: string; quantity?: number }>;
    };

    const name = String(customerName || '').trim();
    const email = String(customerEmail || '').trim().toLowerCase();
    const phone = String(customerPhone || '').trim();

    if (name.length < 2 || name.length > 120) {
      res.status(400).json({ error: 'Nama lengkap minimal 2 karakter.' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Format alamat email tidak valid.' });
      return;
    }
    if (phone.length < 8 || phone.length > 25) {
      res.status(400).json({ error: 'Nomor WhatsApp / Telegram tidak valid.' });
      return;
    }
    if (!paymentMethod || !VALID_PAYMENT_METHODS.has(paymentMethod)) {
      res.status(400).json({ error: 'Metode pembayaran tidak didukung.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
      res.status(400).json({ error: 'Keranjang belanja kosong.' });
      return;
    }

    const resolvedItems: OrderItem[] = [];
    const productUpdates: Array<{ product: Product; qty: number }> = [];
    let totalAmount = 0;

    for (const entry of items) {
      const pid = String(entry.productId || '');
      const qty = Math.floor(Number(entry.quantity || 0));
      if (!pid || !Number.isFinite(qty) || qty < 1 || qty > 50) {
        res.status(400).json({ error: 'Jumlah item tidak valid.' });
        return;
      }
      const product = db.products.find((p) => p.id === pid && p.status === 'active');
      if (!product) {
        res.status(404).json({ error: 'Salah satu produk sudah tidak tersedia.' });
        return;
      }
      if (!product.unlimitedStock && product.stock < qty) {
        res.status(409).json({
          error: `Stok untuk "${product.title}" hanya tersisa ${product.stock} unit.`,
        });
        return;
      }

      resolvedItems.push({
        productId: product.id,
        title: product.title,
        price: product.price,
        quantity: qty,
        fileName: product.fileName,
      });
      productUpdates.push({ product, qty });
      totalAmount += product.price * qty;
    }

    // Reserve stock atomically
    for (const { product, qty } of productUpdates) {
      if (!product.unlimitedStock) {
        product.stock = Math.max(0, product.stock - qty);
        product.updatedAt = new Date().toISOString();
      }
    }

    const invoiceNumber = 1001 + db.orders.length;
    const invoiceCode = `INV-${new Date().getFullYear()}-${invoiceNumber}`;
    const refPrefix = paymentMethod === 'qris' ? 'QRIS' : paymentMethod.toUpperCase().replace('_', '-');
    const paymentReference = `${refPrefix}-${crypto.randomInt(10000000, 99999999)}`;

    const order: Order = {
      id: `ord-${crypto.randomUUID().slice(0, 12)}`,
      invoiceCode,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      paymentMethod,
      paymentReference,
      items: resolvedItems,
      totalAmount,
      status: 'PENDING',
      downloadToken: crypto.randomBytes(24).toString('hex'),
      telegramStatus: 'pending',
      createdAt: new Date().toISOString(),
    };

    db.orders.unshift(order);
    saveDatabase(db);

    if (db.settings.telegram.notifyOnOrderCreated) {
      const msg = buildOrderTelegramMessage(order, db.settings, 'created');
      const result = await dispatchTelegramNotification({
        event: 'order_created',
        text: msg,
        orderId: order.id,
      });
      order.telegramStatus = result.status;
      order.telegramMessage = result.detail;
      saveDatabase(db);
    }

    for (const { product } of productUpdates) {
      await notifyLowStockIfNeeded(product);
    }

    // Never expose downloadToken while status is PENDING
    res.status(201).json({
      order: {
        ...order,
        downloadToken: '',
      },
    });
  });

  // PUBLIC: Confirm automated payment & unlock digital file downloads + Telegram notification
  app.post('/api/orders/:id/pay', async (req, res) => {
    const db = loadDatabase();
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    if (order.status === 'CANCELLED') {
      res.status(409).json({ error: 'Pesanan ini telah dibatalkan.' });
      return;
    }

    if (order.status !== 'PAID') {
      order.status = 'PAID';
      order.paidAt = new Date().toISOString();

      for (const item of order.items) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) {
          prod.salesCount += item.quantity;
        }
      }
      saveDatabase(db);

      if (db.settings.telegram.notifyOnOrderPaid) {
        const msg = buildOrderTelegramMessage(order, db.settings, 'paid');
        const result = await dispatchTelegramNotification({
          event: 'order_paid',
          text: msg,
          orderId: order.id,
        });
        order.telegramStatus = result.status;
        order.telegramMessage = result.detail;
        saveDatabase(db);
      }
    }

    res.json({ order });
  });

  // PUBLIC (Token-Verified): Download digital product file after payment is PAID
  app.get('/api/orders/:id/download/:productId', (req, res) => {
    const db = loadDatabase();
    const order = db.orders.find((o) => o.id === req.params.id);
    const token = String(req.query.token || '');

    if (!order || order.status !== 'PAID' || !token) {
      res.status(403).json({ error: 'Akses unduhan tidak valid atau pembayaran belum lunas.' });
      return;
    }

    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(order.downloadToken);
    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      res.status(403).json({ error: 'Token unduhan tidak valid.' });
      return;
    }

    const purchased = order.items.find((i) => i.productId === req.params.productId);
    if (!purchased) {
      res.status(404).json({ error: 'Produk tidak termasuk dalam pesanan ini.' });
      return;
    }

    const product = db.products.find((p) => p.id === purchased.productId);
    if (!product) {
      res.status(404).json({ error: 'File produk tidak ditemukan.' });
      return;
    }

    const safeFileKey = path.basename(product.fileKey);
    const resolvedPath = path.resolve(UPLOADS_DIR, safeFileKey);
    if (!resolvedPath.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolvedPath)) {
      res.status(404).json({ error: 'File produk belum tersedia di server.' });
      return;
    }

    const downloadFilename = path.basename(product.fileName || safeFileKey).replace(/["\r\n]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(resolvedPath);
  });

  // ADMIN AUTH: Check whether first-run setup or standard login is required
  app.get('/api/admin/auth/status', (_req, res) => {
    const db = loadDatabase();
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const mode = envPasscode ? 'env' : db.adminAuth ? 'claimed' : 'setup_required';
    res.json({
      mode,
      setupRequired: mode === 'setup_required',
    });
  });

  // ADMIN AUTH: First-run password claim (locks automatically once claimed or when ADMIN_PASSCODE env is set)
  app.post('/api/admin/auth/setup', (req, res) => {
    const db = loadDatabase();
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode || db.adminAuth) {
      res.status(409).json({ error: 'Kata sandi admin sudah aktif. Silakan masuk menggunakan kata sandi Anda.' });
      return;
    }
    const password = String(req.body?.password || '');
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Kata sandi admin minimal 8 karakter.' });
      return;
    }
    db.adminAuth = hashPassword(password);
    saveDatabase(db);
    const token = issueSessionToken();
    res.status(201).json({ token });
  });

  // ADMIN AUTH: Standard password verification
  app.post('/api/admin/auth/login', (req, res) => {
    const db = loadDatabase();
    const password = String(req.body?.password || '');
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();

    if (!password) {
      res.status(400).json({ error: 'Masukkan kata sandi admin.' });
      return;
    }

    let valid = false;
    if (envPasscode) {
      valid = verifyEnvPasscode(password, envPasscode);
    } else if (db.adminAuth) {
      valid = verifyPasswordHash(password, db.adminAuth);
    } else {
      res.status(409).json({ error: 'Akun admin belum diaktifkan. Silakan atur kata sandi terlebih dahulu.' });
      return;
    }

    if (!valid) {
      res.status(401).json({ error: 'Kata sandi admin salah.' });
      return;
    }

    const token = issueSessionToken();
    res.json({ token });
  });

  app.post('/api/admin/auth/logout', requireAdmin, (req, res) => {
    const token = (req.headers.authorization || '').slice('Bearer '.length).trim();
    adminSessions.delete(token);
    res.json({ ok: true });
  });

  // ADMIN: Dashboard overview
  app.get('/api/admin/overview', requireAdmin, (_req, res) => {
    res.json(buildAdminOverview());
  });

  // ADMIN: Upload digital product file or product cover image
  app.post('/api/admin/upload', requireAdmin, (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Unggahan file gagal.';
        res.status(400).json({ error: message });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Tidak ada file yang dipilih.' });
        return;
      }

      const kind = String(req.query.kind || 'product');
      const fileKey = path.basename(req.file.filename);
      const originalName = path.basename(req.file.originalname);
      const fileSize = formatFileSize(req.file.size);

      res.status(201).json({
        fileKey,
        fileName: originalName,
        fileSize,
        url: kind === 'cover' ? `/api/media/${encodeURIComponent(fileKey)}` : null,
      });
    });
  });

  // ADMIN: Create new product
  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const db = loadDatabase();
    const body = req.body as Partial<Product>;

    const title = String(body.title || '').trim();
    const category = String(body.category || '').trim() || 'UI Kit & Template';
    const price = Math.round(Number(body.price));
    const originalPrice = body.originalPrice ? Math.round(Number(body.originalPrice)) : undefined;
    const unlimitedStock = Boolean(body.unlimitedStock);
    const stock = unlimitedStock ? -1 : Math.max(0, Math.floor(Number(body.stock ?? 0)));
    const shortDescription = String(body.shortDescription || '').trim();
    const description = String(body.description || '').trim();
    const format = String(body.format || 'ZIP / Digital').trim();
    const fileName = String(body.fileName || '').trim();
    const fileKey = path.basename(String(body.fileKey || '').trim());
    const fileSize = String(body.fileSize || '12 KB').trim();
    const coverImage = String(body.coverImage || '').trim();

    if (title.length < 3) {
      res.status(400).json({ error: 'Nama produk minimal 3 karakter.' });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'Harga produk harus berupa angka valid.' });
      return;
    }
    if (!isSafeUrlOrPath(coverImage)) {
      res.status(400).json({ error: 'URL atau path gambar sampul tidak valid.' });
      return;
    }

    let finalFileKey = fileKey;
    let finalFileName = fileName;
    let finalFileSize = fileSize;

    // If admin did not upload a file yet, generate a clean digital license placeholder file safely
    if (!finalFileKey) {
      finalFileKey = `product-${crypto.randomUUID()}.txt`;
      const target = path.resolve(UPLOADS_DIR, finalFileKey);
      if (target.startsWith(UPLOADS_DIR + path.sep)) {
        fs.writeFileSync(
          target,
          `KARSA DIGITAL — LISENSI RESMI\nProduk: ${title}\nKategori: ${category}\n\n${description || shortDescription}\n`,
          'utf8',
        );
        finalFileSize = formatFileSize(fs.statSync(target).size);
      }
      finalFileName = `${createSlug(title)}.txt`;
    }

    const now = new Date().toISOString();
    const highlights = Array.isArray(body.highlights)
      ? body.highlights.map((h) => String(h).trim()).filter(Boolean).slice(0, 8)
      : [];

    const product: Product = {
      id: `prod-${crypto.randomUUID().slice(0, 8)}`,
      slug: createSlug(body.slug ? String(body.slug) : title),
      title,
      category,
      price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : undefined,
      stock,
      unlimitedStock,
      shortDescription: shortDescription || description.slice(0, 140),
      description: description || shortDescription,
      highlights,
      format,
      fileSize: finalFileSize,
      fileName: finalFileName || finalFileKey,
      fileKey: finalFileKey,
      coverImage,
      status: body.status === 'draft' ? 'draft' : 'active',
      featured: Boolean(body.featured),
      salesCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.settings.categories.includes(category)) {
      db.settings.categories.push(category);
    }

    db.products.unshift(product);
    saveDatabase(db);
    res.status(201).json({ product, overview: buildAdminOverview() });
  });

  // ADMIN: Update existing product or stock
  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const db = loadDatabase();
    const product = db.products.find((p) => p.id === req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Produk tidak ditemukan.' });
      return;
    }

    const body = req.body as Partial<Product>;
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (title.length < 3) {
        res.status(400).json({ error: 'Nama produk minimal 3 karakter.' });
        return;
      }
      product.title = title;
    }
    if (body.slug !== undefined) {
      product.slug = createSlug(String(body.slug));
    }
    if (body.category !== undefined) {
      const cat = String(body.category).trim();
      if (cat) {
        product.category = cat;
        if (!db.settings.categories.includes(cat)) {
          db.settings.categories.push(cat);
        }
      }
    }
    if (body.price !== undefined) {
      const price = Math.round(Number(body.price));
      if (!Number.isFinite(price) || price < 0) {
        res.status(400).json({ error: 'Harga tidak valid.' });
        return;
      }
      product.price = price;
    }
    if (body.originalPrice !== undefined) {
      const orig = Math.round(Number(body.originalPrice));
      product.originalPrice = Number.isFinite(orig) && orig > product.price ? orig : undefined;
    }
    if (body.unlimitedStock !== undefined) {
      product.unlimitedStock = Boolean(body.unlimitedStock);
      if (product.unlimitedStock) {
        product.stock = -1;
      } else if (product.stock < 0) {
        product.stock = Math.max(0, Math.floor(Number(body.stock ?? 10)));
      }
    }
    if (body.stock !== undefined && !product.unlimitedStock) {
      const nextStock = Math.max(0, Math.floor(Number(body.stock)));
      if (Number.isFinite(nextStock)) {
        product.stock = nextStock;
      }
    }
    if (body.shortDescription !== undefined) {
      product.shortDescription = String(body.shortDescription).trim();
    }
    if (body.description !== undefined) {
      product.description = String(body.description).trim();
    }
    if (Array.isArray(body.highlights)) {
      product.highlights = body.highlights.map((h) => String(h).trim()).filter(Boolean).slice(0, 8);
    }
    if (body.format !== undefined) product.format = String(body.format).trim();
    if (body.fileSize !== undefined) product.fileSize = String(body.fileSize).trim();
    if (body.fileName !== undefined) product.fileName = String(body.fileName).trim();
    if (body.fileKey !== undefined && String(body.fileKey).trim()) {
      product.fileKey = path.basename(String(body.fileKey).trim());
    }
    if (body.coverImage !== undefined) {
      const cover = String(body.coverImage).trim();
      if (!isSafeUrlOrPath(cover)) {
        res.status(400).json({ error: 'URL sampul tidak valid.' });
        return;
      }
      product.coverImage = cover;
    }
    if (body.status === 'active' || body.status === 'draft') {
      product.status = body.status;
    }
    if (body.featured !== undefined) {
      product.featured = Boolean(body.featured);
    }

    product.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json({ product, overview: buildAdminOverview() });
  });

  // ADMIN: Delete product
  app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
    const db = loadDatabase();
    const index = db.products.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: 'Produk tidak ditemukan.' });
      return;
    }
    db.products.splice(index, 1);
    saveDatabase(db);
    res.json({ overview: buildAdminOverview() });
  });

  // ADMIN: Update order status manually (e.g., mark PAID or CANCELLED)
  app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
    const db = loadDatabase();
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }
    const nextStatus = req.body?.status;
    if (nextStatus !== 'PENDING' && nextStatus !== 'PAID' && nextStatus !== 'CANCELLED') {
      res.status(400).json({ error: 'Status pesanan tidak valid.' });
      return;
    }

    const prevStatus = order.status;
    order.status = nextStatus;

    if (nextStatus === 'PAID' && prevStatus !== 'PAID') {
      order.paidAt = new Date().toISOString();
      for (const item of order.items) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) prod.salesCount += item.quantity;
      }
      saveDatabase(db);
      if (db.settings.telegram.notifyOnOrderPaid) {
        const msg = buildOrderTelegramMessage(order, db.settings, 'paid');
        const result = await dispatchTelegramNotification({
          event: 'order_paid',
          text: msg,
          orderId: order.id,
        });
        order.telegramStatus = result.status;
        order.telegramMessage = result.detail;
      }
    } else if (nextStatus === 'CANCELLED' && prevStatus === 'PENDING') {
      // Restore reserved stock when cancelling a pending order
      for (const item of order.items) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod && !prod.unlimitedStock) {
          prod.stock += item.quantity;
        }
      }
    }

    saveDatabase(db);
    res.json({ order, overview: buildAdminOverview() });
  });

  // ADMIN: Resend Telegram notification for an order
  app.post('/api/admin/orders/:id/resend-telegram', requireAdmin, async (req, res) => {
    const db = loadDatabase();
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }
    const stage = order.status === 'PAID' ? 'paid' : 'created';
    const msg = buildOrderTelegramMessage(order, db.settings, stage);
    const result = await dispatchTelegramNotification({
      event: stage === 'paid' ? 'order_paid' : 'order_created',
      text: msg,
      orderId: order.id,
    });
    order.telegramStatus = result.status;
    order.telegramMessage = result.detail;
    saveDatabase(db);
    res.json({ result, overview: buildAdminOverview() });
  });

  // ADMIN: Update store theme, SEO, categories, payment, and Telegram preferences
  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const db = loadDatabase();
    const { theme, seo, telegram, payment, categories, resetTheme } = req.body as {
      theme?: Partial<typeof db.settings.theme>;
      seo?: Partial<typeof db.settings.seo>;
      telegram?: Partial<typeof db.settings.telegram>;
      payment?: Partial<typeof db.settings.payment>;
      categories?: string[];
      resetTheme?: boolean;
    };

    if (resetTheme) {
      db.settings.theme = getDefaultSettings().theme;
    } else if (theme) {
      if (theme.heroImage && !isSafeUrlOrPath(theme.heroImage)) {
        res.status(400).json({ error: 'URL gambar hero tidak valid.' });
        return;
      }
      if (theme.accentColor && !/^#[0-9a-fA-F]{6}$/.test(theme.accentColor)) {
        res.status(400).json({ error: 'Format warna aksen harus HEX 6 digit (mis. #1D4ED8).' });
        return;
      }
      db.settings.theme = {
        ...db.settings.theme,
        ...theme,
        gridColumns: theme.gridColumns === 2 ? 2 : 3,
      };
    }

    if (seo) {
      if (seo.canonicalUrl && !isSafeUrlOrPath(seo.canonicalUrl)) {
        res.status(400).json({ error: 'Canonical URL harus diawali http:// atau https://.' });
        return;
      }
      db.settings.seo = { ...db.settings.seo, ...seo };
    }

    if (telegram) {
      db.settings.telegram = {
        ...db.settings.telegram,
        ...telegram,
        lowStockThreshold: Math.max(
          0,
          Math.min(100, Math.floor(Number(telegram.lowStockThreshold ?? db.settings.telegram.lowStockThreshold))),
        ),
      };
    }

    if (payment) {
      if (payment.qrisImageUrl && !isSafeUrlOrPath(payment.qrisImageUrl)) {
        res.status(400).json({ error: 'URL gambar QRIS tidak valid.' });
        return;
      }
      const nextMethods = Array.isArray(payment.methods)
        ? payment.methods
            .filter((m) => VALID_PAYMENT_METHODS.has(m.id))
            .map((m) => ({
              id: m.id,
              label: String(m.label || '').trim().slice(0, 60),
              description: String(m.description || '').trim().slice(0, 140),
              enabled: Boolean(m.enabled),
              accountNumber: String(m.accountNumber || '').trim().slice(0, 60),
              accountHolder: String(m.accountHolder || '').trim().slice(0, 80),
            }))
        : db.settings.payment.methods;

      db.settings.payment = {
        ...db.settings.payment,
        provider:
          payment.provider === 'midtrans' ||
          payment.provider === 'tripay' ||
          payment.provider === 'xendit' ||
          payment.provider === 'builtin_auto'
            ? payment.provider
            : db.settings.payment.provider,
        merchantName: String(payment.merchantName ?? db.settings.payment.merchantName).trim().slice(0, 80),
        qrisMerchantId: String(payment.qrisMerchantId ?? db.settings.payment.qrisMerchantId).trim().slice(0, 60),
        qrisImageUrl: String(payment.qrisImageUrl ?? db.settings.payment.qrisImageUrl).trim(),
        expiryMinutes: Math.max(
          5,
          Math.min(1440, Math.floor(Number(payment.expiryMinutes ?? db.settings.payment.expiryMinutes))),
        ),
        autoConfirmDemo: Boolean(payment.autoConfirmDemo ?? db.settings.payment.autoConfirmDemo),
        methods: nextMethods.length > 0 ? nextMethods : db.settings.payment.methods,
      };
    }

    if (Array.isArray(categories)) {
      const cleaned = Array.from(new Set(categories.map((c) => String(c).trim()).filter(Boolean)));
      if (cleaned.length > 0) {
        db.settings.categories = cleaned;
      }
    }

    saveDatabase(db);
    res.json({ overview: buildAdminOverview() });
  });

  // ADMIN: Test Telegram Bot connectivity
  app.post('/api/admin/telegram/test', requireAdmin, async (_req, res) => {
    const db = loadDatabase();
    const text = [
      `Uji Koneksi Bot Telegram — ${db.settings.theme.storeName}`,
      `Waktu Server: ${new Date().toLocaleString('id-ID')}`,
      'Status: Integrasi notifikasi pesanan real-time aktif dan siap digunakan.',
    ].join('\n');

    const result = await dispatchTelegramNotification({
      event: 'test',
      text,
    });
    res.json({ result, overview: buildAdminOverview() });
  });

  // Serve Vite in dev or built dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Karsa Digital server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
