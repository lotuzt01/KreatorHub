import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Image as ImageIcon,
  Link2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { MediaAsset, MediaAssetCategory, Product, ThemeConfig } from '../types/store';
import { PRESET_PRODUCT_COVERS } from '../lib/format';
import {
  compressImageFileToDataUrl,
  formatFileSizeKB,
  isSafeExternalImageUrl,
  toAssetUri,
  type CompressedImageResult,
} from '../lib/mediaAssets';
import {
  createFirestoreMediaAsset,
  deleteFirestoreMediaAsset,
  saveFirestorePublicSettings,
} from '../lib/firestoreStore';
import { SafeImage } from './SafeImage';

interface MediaGalleryPanelProps {
  mediaAssets: MediaAsset[];
  products: Product[];
  theme: ThemeConfig;
}

const CATEGORY_LABELS: Record<MediaAssetCategory, string> = {
  product: 'Sampul Produk',
  hero: 'Banner Hero',
  general: 'Umum',
};

export function MediaGalleryPanel({
  mediaAssets,
  products,
  theme,
}: MediaGalleryPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<MediaAssetCategory>('product');
  const [externalUrl, setExternalUrl] = useState('');
  const [compressed, setCompressed] = useState<CompressedImageResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [filterCategory, setFilterCategory] = useState<'all' | MediaAssetCategory>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track where each asset URI is currently used across products and Hero banner
  const usageMap = useMemo(() => {
    const map = new Map<string, { hero: boolean; productCount: number }>();
    for (const asset of mediaAssets) {
      const uri = toAssetUri(asset.id);
      const hero = theme.heroImage === uri || theme.heroImage === asset.url;
      const productCount = products.filter(
        (p) => p.coverImage === uri || p.coverImage === asset.url,
      ).length;
      map.set(asset.id, { hero, productCount });
    }
    return map;
  }, [mediaAssets, products, theme.heroImage]);

  const filteredAssets = useMemo(() => {
    if (filterCategory === 'all') return mediaAssets;
    return mediaAssets.filter((a) => a.category === filterCategory);
  }, [mediaAssets, filterCategory]);

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFeedback(null);
    setCompressing(true);
    try {
      const result = await compressImageFileToDataUrl(file);
      setCompressed(result);
      if (!label.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
        setLabel(cleanName.slice(0, 80) || 'Aset Gambar Baru');
      }
    } catch (err) {
      setCompressed(null);
      setError(err instanceof Error ? err.message : 'Gagal memproses file gambar.');
    } finally {
      setCompressing(false);
    }
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError('Masukkan nama atau label untuk aset gambar ini.');
      return;
    }

    if (mode === 'upload') {
      if (!compressed) {
        setError('Pilih foto dari galeri HP atau komputer terlebih dahulu.');
        return;
      }
    } else {
      if (!isSafeExternalImageUrl(externalUrl)) {
        setError('Masukkan URL gambar yang valid dan diawali https:// (maks. 500 karakter).');
        return;
      }
    }

    setSaving(true);
    try {
      await createFirestoreMediaAsset(
        mode === 'upload' && compressed
          ? {
              label: trimmedLabel,
              category,
              sourceType: 'upload',
              url: compressed.dataUrl,
              mimeType: compressed.mimeType,
              width: compressed.width,
              height: compressed.height,
              sizeBytes: compressed.sizeBytes,
            }
          : {
              label: trimmedLabel,
              category,
              sourceType: 'url',
              url: externalUrl.trim(),
              mimeType: 'image/external',
              width: 0,
              height: 0,
              sizeBytes: 0,
            },
      );

      setLabel('');
      setExternalUrl('');
      setCompressed(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFeedback('Aset gambar berhasil ditambahkan ke Galeri Cloud & langsung bisa dipakai di produk maupun Hero.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan aset gambar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAsset = async (asset: MediaAsset) => {
    setError(null);
    setFeedback(null);
    setBusyId(asset.id);
    try {
      await deleteFirestoreMediaAsset(asset.id);
      setConfirmDeleteId(null);
      setFeedback(`Aset "${asset.label}" telah dihapus dari Galeri Cloud.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus aset gambar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSetAsHero = async (imageRef: string, assetLabel: string) => {
    setError(null);
    setFeedback(null);
    setBusyId(`hero-${imageRef}`);
    try {
      await saveFirestorePublicSettings({
        theme: { ...theme, heroImage: imageRef },
      });
      setFeedback(`"${assetLabel}" sekarang aktif sebagai Banner Hero toko secara real-time.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menerapkan gambar Hero.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyRef = async (asset: MediaAsset) => {
    const value = asset.sourceType === 'url' ? asset.url : toAssetUri(asset.id);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId((prev) => (prev === asset.id ? null : prev)), 2000);
    } catch {
      setError('Gagal menyalin referensi gambar.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4 dark:border-zinc-800">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-zinc-50">
          Galeri Aset Gambar Toko
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
          Unggah gambar langsung dari galeri HP/komputer atau simpan link HTTPS. Semua aset otomatis dikompresi, tersimpan real-time di cloud, dan bisa dipakai untuk sampul produk maupun Banner Hero.
        </p>
      </div>

      {feedback && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload / Add Form */}
      <form
        onSubmit={handleSaveAsset}
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
            Tambah Aset Gambar Baru
          </h3>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                setError(null);
              }}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${
                mode === 'upload'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Unggah dari Galeri HP / File</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('url');
                setError(null);
              }}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${
                mode === 'url'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white'
                  : 'text-slate-600 dark:text-zinc-400'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tambah via URL HTTPS</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-12">
          {/* Left: File picker / URL input */}
          <div className="space-y-3.5 lg:col-span-7">
            {mode === 'upload' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Pilih Gambar (JPG, PNG, WebP)
                </label>
                <div className="mt-1.5 flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:bg-zinc-950">
                  <div className="min-w-0 text-xs text-slate-600 dark:text-zinc-400">
                    {compressing ? (
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        Mengoptimalkan ukuran gambar...
                      </span>
                    ) : compressed ? (
                      <div className="space-y-0.5">
                        <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                          Siap diunggah ({formatFileSizeKB(compressed.sizeBytes)})
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          Resolusi optimal: {compressed.width} × {compressed.height} px
                        </p>
                      </div>
                    ) : (
                      <p>
                        Foto otomatis diperkecil &amp; dikompresi agar toko tetap ringan dan cepat dibuka di HP.
                      </p>
                    )}
                  </div>
                  <label className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{compressed ? 'Ganti Foto' : 'Pilih Foto'}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/*"
                      className="hidden"
                      onChange={(e) => handleFileChange(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  URL Gambar Eksternal (Wajib https://)
                </label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            )}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Nama / Label Aset
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Contoh: Sampul E-Book Bisnis"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Kategori Penggunaan
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MediaAssetCategory)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="product">Sampul Produk</option>
                  <option value="hero">Banner Hero</option>
                  <option value="general">Umum</option>
                </select>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={saving || compressing}
                style={{ backgroundColor: 'var(--store-accent)' }}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg px-5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                <span>{saving ? 'Menyimpan ke Cloud...' : 'Simpan ke Galeri Cloud'}</span>
              </button>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Pratinjau Gambar
            </p>
            <div className="mt-1.5 aspect-4/3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950">
              {mode === 'upload' && compressed ? (
                <img
                  src={compressed.dataUrl}
                  alt={label || 'Pratinjau gambar'}
                  className="h-full w-full object-cover"
                />
              ) : mode === 'url' && isSafeExternalImageUrl(externalUrl) ? (
                <SafeImage
                  src={externalUrl.trim()}
                  alt={label || 'Pratinjau URL gambar'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                  <ImageIcon className="h-8 w-8 opacity-50" aria-hidden="true" />
                  <p className="mt-2">Pratinjau gambar akan tampil di sini</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Custom Uploaded & Saved Assets Grid */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-zinc-100">
              Koleksi Aset Anda ({mediaAssets.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Klik Hapus untuk membuang aset yang tidak lagi diperlukan.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'product', 'hero', 'general'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCategory(cat)}
                className={`h-8 cursor-pointer rounded-lg border px-3 text-xs font-medium transition-colors ${
                  filterCategory === cat
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                }`}
              >
                {cat === 'all' ? 'Semua' : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <ImageIcon className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-zinc-200">
              Belum ada aset gambar kustom di kategori ini
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              Unggah foto dari galeri HP/komputer menggunakan formulir di atas untuk mulai membangun koleksi visual toko Anda.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAssets.map((asset) => {
              const uri = toAssetUri(asset.id);
              const usage = usageMap.get(asset.id);
              const isHero = Boolean(usage?.hero);
              const productCount = usage?.productCount ?? 0;
              const confirmingDelete = confirmDeleteId === asset.id;

              return (
                <div
                  key={asset.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="relative aspect-4/3 bg-slate-100 dark:bg-zinc-950">
                    <SafeImage
                      src={uri}
                      alt={asset.label}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute top-2.5 left-2.5 rounded bg-slate-950/75 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {CATEGORY_LABELS[asset.category]}
                    </span>
                    <span className="absolute top-2.5 right-2.5 rounded bg-white/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-800 dark:bg-zinc-900/90 dark:text-zinc-200">
                      {asset.sourceType === 'upload'
                        ? formatFileSizeKB(asset.sizeBytes)
                        : 'HTTPS'}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-100">
                      {asset.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
                      {asset.width > 0 && asset.height > 0
                        ? `${asset.width}×${asset.height} px · `
                        : ''}
                      {isHero && productCount > 0
                        ? `Aktif di Hero & ${productCount} produk`
                        : isHero
                          ? 'Aktif sebagai Banner Hero'
                          : productCount > 0
                            ? `Dipakai di ${productCount} produk`
                            : 'Belum dipakai di katalog'}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                      <button
                        type="button"
                        disabled={isHero || busyId === `hero-${uri}`}
                        onClick={() => handleSetAsHero(uri, asset.label)}
                        className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors ${
                          isHero
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        <span>{isHero ? 'Hero Aktif' : 'Jadikan Hero'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyRef(asset)}
                        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        {copiedId === asset.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>

                      <div className="ml-auto">
                        {confirmingDelete ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busyId === asset.id}
                              onClick={() => handleDeleteAsset(asset)}
                              className="h-8 cursor-pointer rounded-lg bg-red-600 px-2.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {busyId === asset.id ? '...' : 'Hapus'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="h-8 cursor-pointer rounded-lg border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Hapus ${asset.label}`}
                            onClick={() => setConfirmDeleteId(asset.id)}
                            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-800 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Built-in Presets Section */}
      <div className="space-y-3 border-t border-slate-200 pt-6 dark:border-zinc-800">
        <div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
            Preset Bawaan Studio ({PRESET_PRODUCT_COVERS.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Gambar bawaan yang selalu tersedia sebagai cadangan jika Anda belum mengunggah gambar sendiri.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {PRESET_PRODUCT_COVERS.map((preset) => {
            const isHero = theme.heroImage === preset.path;
            return (
              <div
                key={preset.path}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="aspect-4/3 bg-slate-100 dark:bg-zinc-950">
                  <SafeImage
                    src={preset.path}
                    alt={preset.label}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium text-slate-800 dark:text-zinc-200">
                    {preset.label}
                  </p>
                  <button
                    type="button"
                    disabled={isHero || busyId === `hero-${preset.path}`}
                    onClick={() => handleSetAsHero(preset.path, preset.label)}
                    className={`mt-2 inline-flex h-7 w-full cursor-pointer items-center justify-center rounded-md border text-[11px] font-semibold transition-colors ${
                      isHero
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {isHero ? 'Hero Aktif' : 'Jadikan Hero'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
