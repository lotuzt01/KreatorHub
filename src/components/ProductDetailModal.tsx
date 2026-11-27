import { Check, FileArchive, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import type { Product } from '../types/store';
import { formatIDR } from '../lib/format';
import { SafeImage } from './SafeImage';

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
}

export function ProductDetailModal({
  product,
  onClose,
  onAddToCart,
  onBuyNow,
}: ProductDetailModalProps) {
  if (!product) return null;

  const isOutOfStock = !product.unlimitedStock && product.stock <= 0;
  const stockText = product.unlimitedStock
    ? 'Tersedia instan'
    : product.stock > 0
      ? `Sisa ${product.stock} lisensi`
      : 'Stok habis';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdp-title"
      onClick={onClose}
    >
      <div
        style={{ borderRadius: 'var(--store-radius)' }}
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto border border-slate-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
            <span>{product.category}</span>
            <span aria-hidden="true">·</span>
            <span>{product.format}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{product.fileSize}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail produk"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-8 p-6 md:grid-cols-12 md:p-8">
          {/* Left: Product visual + technical details */}
          <div className="space-y-5 md:col-span-6">
            <div
              style={{ borderRadius: 'var(--store-radius)' }}
              className="aspect-4/3 overflow-hidden border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <SafeImage
                src={product.coverImage}
                alt={product.title}
                fallbackLabel={product.title}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 text-sm dark:border-zinc-800">
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">File Unduhan</p>
                <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-900 dark:text-zinc-100">
                  <FileArchive className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="truncate">{product.fileName}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Pengiriman</p>
                <p className="mt-1 flex items-center gap-1.5 font-medium text-slate-900 dark:text-zinc-100">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Otomatis setelah bayar</span>
                </p>
              </div>
            </div>
          </div>

          {/* Right: Contiguous Purchase Module */}
          <div className="flex flex-col justify-between space-y-6 md:col-span-6">
            <div className="space-y-4">
              <h2
                id="pdp-title"
                className="font-display text-2xl font-bold tracking-tight text-slate-900 [text-wrap:balance] dark:text-zinc-50"
              >
                {product.title}
              </h2>

              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                  {formatIDR(product.price)}
                </span>
                {product.originalPrice && product.originalPrice > product.price && (
                  <span className="font-mono text-sm tabular-nums text-slate-400 line-through dark:text-zinc-500">
                    {formatIDR(product.originalPrice)}
                  </span>
                )}
              </div>

              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                {product.description}
              </p>

              {product.highlights.length > 0 && (
                <div className="border-t border-slate-200 pt-4 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                    Yang Anda dapatkan
                  </h3>
                  <ul className="mt-3 space-y-2.5 text-sm text-slate-600 dark:text-zinc-300">
                    {product.highlights.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-5 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                <span>Ketersediaan: {stockText}</span>
                <span className="font-mono tabular-nums">{product.salesCount} terjual</span>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => onBuyNow(product)}
                  style={{
                    backgroundColor: isOutOfStock ? undefined : 'var(--store-accent)',
                    borderRadius: 'var(--store-radius)',
                  }}
                  className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 whitespace-nowrap dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                >
                  {isOutOfStock ? 'Stok Habis' : 'Beli Sekarang'}
                </button>
                <button
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => {
                    onAddToCart(product);
                    onClose();
                  }}
                  style={{ borderRadius: 'var(--store-radius)' }}
                  className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  <span>Tambah ke Keranjang</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
