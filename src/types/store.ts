export type PaymentMethod =
  | 'telegram_bank'
  | 'bank_transfer'
  | 'qris'
  | 'va_bca'
  | 'va_mandiri'
  | 'ewallet_gopay'
  | 'ewallet_dana';

export type PaymentGatewayProvider = 'builtin_auto' | 'midtrans' | 'tripay' | 'xendit';

export type OrderStatus =
  | 'AWAITING_BANK'
  | 'PENDING'
  | 'PAYMENT_SUBMITTED'
  | 'PAID'
  | 'CANCELLED';

export type CornerStyle = 'sharp' | 'modern' | 'soft';

export interface PaymentMethodConfig {
  id: PaymentMethod;
  label: string;
  description: string;
  enabled: boolean;
  accountNumber: string;
  accountHolder: string;
}

export interface PaymentSettings {
  provider: PaymentGatewayProvider;
  merchantName: string;
  qrisMerchantId: string;
  qrisImageUrl: string;
  expiryMinutes: number;
  autoConfirmDemo: boolean;
  methods: PaymentMethodConfig[];
}

export interface PaymentGatewayStatus {
  midtransConfigured: boolean;
  webhookSecretConfigured: boolean;
  mode: 'production' | 'sandbox';
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  category: string;
  price: number;
  originalPrice?: number;
  stock: number; // -1 represents unlimited digital stock
  unlimitedStock: boolean;
  shortDescription: string;
  description: string;
  highlights: string[];
  format: string;
  fileSize: string;
  fileName: string;
  fileKey: string;
  coverImage: string;
  status: 'active' | 'draft';
  featured: boolean;
  salesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  fileName: string;
}

export interface Order {
  id: string;
  invoiceCode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  downloadToken: string;
  telegramStatus: 'sent' | 'not_configured' | 'failed' | 'pending';
  telegramMessage?: string;
  telegramOrderMessageId?: number;
  telegramTransferMessageId?: number;
  adminBankName?: string;
  adminBankNumber?: string;
  adminBankHolder?: string;
  adminTransferAmount?: number;
  createdAt: string;
  paidAt?: string;
}

export interface ThemeConfig {
  storeName: string;
  heroEyebrow: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroCtaText: string;
  heroImage: string;
  accentColor: string;
  defaultMode: 'light' | 'dark';
  cornerStyle: CornerStyle;
  gridColumns: 2 | 3;
  contactEmail: string;
  footerNotice: string;
}

export interface SeoConfig {
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  canonicalUrl: string;
  ogSiteName: string;
}

export interface TelegramPreferences {
  notifyOnOrderCreated: boolean;
  notifyOnOrderPaid: boolean;
  notifyOnLowStock: boolean;
  lowStockThreshold: number;
  customChatIdOverride: string;
  messageHeader: string;
}

export interface TelegramLog {
  id: string;
  timestamp: string;
  event: 'order_created' | 'transfer_submitted' | 'order_paid' | 'low_stock' | 'test';
  orderId?: string;
  status: 'sent' | 'not_configured' | 'failed';
  detail: string;
  preview: string;
}

export interface StoreSettings {
  theme: ThemeConfig;
  seo: SeoConfig;
  telegram: TelegramPreferences;
  payment: PaymentSettings;
  categories: string[];
}

export interface StorefrontPayload {
  products: Product[];
  settings: {
    theme: ThemeConfig;
    seo: SeoConfig;
    payment: PaymentSettings;
    categories: string[];
  };
  stats: {
    totalProducts: number;
    totalCategories: number;
    completedOrders: number;
  };
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface TelegramConnectionStatus {
  botTokenConfigured: boolean;
  envChatIdConfigured: boolean;
  effectiveChatIdMasked: string | null;
}

export interface AdminOverviewPayload {
  products: Product[];
  orders: Order[];
  settings: StoreSettings;
  telegramStatus: TelegramConnectionStatus;
  paymentStatus: PaymentGatewayStatus;
  telegramLogs: TelegramLog[];
  metrics: {
    totalRevenue: number;
    paidOrdersCount: number;
    pendingOrdersCount: number;
    activeProductsCount: number;
    lowStockProductsCount: number;
  };
}
