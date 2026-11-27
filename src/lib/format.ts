import type { CornerStyle, PaymentMethod } from '../types/store';

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTimeID(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'qris':
      return 'QRIS Otomatis';
    case 'va_bca':
      return 'Virtual Account BCA';
    case 'va_mandiri':
      return 'Virtual Account Mandiri';
    case 'ewallet_gopay':
      return 'GoPay Instan';
    case 'ewallet_dana':
      return 'DANA Instan';
    default:
      return method;
  }
}

export function getRadiusPx(style: CornerStyle): string {
  switch (style) {
    case 'sharp':
      return '4px';
    case 'soft':
      return '18px';
    case 'modern':
    default:
      return '12px';
  }
}

export function darkenHex(hex: string, factor = 0.14): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#1e40af';
  const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function isSafeHttpOrLocalUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const PRESET_ACCENT_COLORS = [
  { name: 'Biru Kobalt', value: '#1D4ED8' },
  { name: 'Zamrud Studio', value: '#047857' },
  { name: 'Amber Hangat', value: '#B45309' },
  { name: 'Indigo Arsitek', value: '#4338CA' },
  { name: 'Merah Terakota', value: '#B91C1C' },
  { name: 'Grafit Monokrom', value: '#18181B' },
] as const;

export const PRESET_PRODUCT_COVERS = [
  {
    label: 'Sistem UI & Dashboard',
    path: '/src/assets/images/product_uikit_saas_1795750142065.jpg',
  },
  {
    label: 'E-Book & Panduan Editorial',
    path: '/src/assets/images/product_ebook_seo_1795750142064.jpg',
  },
  {
    label: 'Arsitektur Kode Modular',
    path: '/src/assets/images/product_code_starter_1795750142604.jpg',
  },
  {
    label: 'Identitas Visual & Pitch Deck',
    path: '/src/assets/images/product_brand_templates_1795750143149.jpg',
  },
  {
    label: 'Studio Digital Hero',
    path: '/src/assets/images/hero_digital_studio_1795750140666.jpg',
  },
] as const;
