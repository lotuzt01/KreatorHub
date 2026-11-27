import { useState } from 'react';
import { AlertCircle, Check, FileUp, Link2, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import type { MediaAsset, Product } from '../types/store';
import { PRESET_PRODUCT_COVERS } from '../lib/format';
import {
  compressImageFileToDataUrl,
  toAssetUri,
} from '../lib/mediaAssets';
import {
  createFirestoreMediaAsset,
  deleteFirestoreMediaAsset,
  saveFirestoreProduct,
} from '../lib/firestoreStore';
import { SafeImage } from './SafeImage';

interface ProductEditorModalProps {
  open: boolean;
  product: Product | null;
  categories: string[];
  mediaAssets: MediaAsset[];
  onClose: () => void;
}

export function ProductEditorModal({
  open,
  product,
  categories,
  mediaAssets,
  onClose,
}: ProductEditorModalProps) {
  const isEditing = Boolean(product);

  const [title, setTitle] = useState(product?.title ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [category, setCategory] = useState(product?.category ?? categories[0] ?? 'UI Kit & Template');
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState(product ? String(product.price) : '149000');
  const [originalPrice, setOriginalPrice] = useState(
    product?.originalPrice ? String(product.originalPrice) : '',
  );
  const [unlimitedStock, setUnlimitedStock] = useState(product?.unlimitedStock ?? true);
  const [stock, setStock] = useState(
    product && !product.unlimitedStock ? String(product.stock) : '25',
  );
  const [format, setFormat] = useState(product?.format ?? 'ZIP / PDF');
  const [shortDescription, setShortDescription] = useState(product?.shortDescription ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [highlights, setHighlights] = useState<string[]>(
    product?.highlights?.length ? product.highlights : ['Pembaruan gratis dan lisensi komersial'],
  );
  const [coverImage, setCoverImage] = useState(
    product?.coverImage ?? PRESET_PRODUCT_COVERS[0].path,
  );
  const [fileKey, setFileKey] = useState(product?.fileKey ?? '');
  const [fileName, setFileName] = useState(product?.fileName ?? '');
  const [fileSize, setFileSize] = useState(product?.fileSize ?? '');
  const [downloadUrl, setDownloadUrl] = useState(product?.downloadUrl ?? '');
  const [status, setStatus] = useState<'active' | 'draft'>(product?.status ?? 'active');
  const [featured, setFeatured] = useState(product?.featured ?? false);

  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSelectFile = (file: File) => {
    setError(null);
    setFileKey(`cloud-${Date.now()}`);
    setFileName(file.name);
    setFileSize(`${Math.max(1, Math.round(file.size / 1024))} KB`);
  };

  const handleUploadCoverImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploadingCover(true);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      const cleanName =
        title.trim() ||
        file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() ||
        'Sampul Produk';
      const created = await createFirestoreMediaAsset({
        label: cleanName.slice(0, 120),
        category: 'product',
        sourceType: 'upload',
        url: compressed.dataUrl,
        mimeType: compressed.mimeType,
        width: compressed.width,
        height: compressed.height,
        sizeBytes: compressed.sizeBytes,
      });
      setCoverImage(toAssetUri(created.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah gambar sampul.');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleQuickDeleteAsset = async (asset: MediaAsset) => {
    setError(null);
    setDeletingAssetId(asset.id);
    try {
      const uri = toAssetUri(asset.id);
      await deleteFirestoreMediaAsset(asset.id);
      if (coverImage === uri || coverImage === asset.url) {
        setCoverImage(PRESET_PRODUCT_COVERS[0].path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus aset gambar.');
    } finally {
      setDeletingAssetId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalCategory = newCategory.trim() || category;
    const numericPrice = Number(price);
    if (!title.trim() || title.trim().length < 3) {
      setError('Nama produk minimal 3 karakter.');
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError('Masukkan harga produk yang valid.');
      return;
    }

    const trimmedDownloadUrl = downloadUrl.trim();
    if (trimmedDownloadUrl) {
      const hasValidProtocol =
        trimmedDownloadUrl.startsWith('https://') || trimmedDownloadUrl.startsWith('http://');
      if (!hasValidProtocol || trimmedDownloadUrl.length > 600) {
        setError(
          'Link download produk harus diawali https:// atau http:// dan maksimal 600 karakter.',
        );
        return;
      }
      try {
        new URL(trimmedDownloadUrl);
      } catch {
        setError('Format link download produk tidak valid. Periksa kembali alamat tautan Anda.');
        return;
      }
    }

    setSaving(true);
    try {
      await saveFirestoreProduct(product, {
        title: title.trim(),
        slug: slug.trim() || undefined,
        category: finalCategory,
        price: numericPrice,
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        unlimitedStock,
        stock: unlimitedStock ? -1 : Math.max(0, Number(stock || 0)),
        format: format.trim() || 'Digital File',
        shortDescription: shortDescription.trim(),
        description: description.trim(),
        highlights: highlights.map((h) => h.trim()).filter(Boolean),
        coverImage,
        fileKey,
        fileName,
        fileSize,
        downloadUrl: trimmedDownloadUrl,
        status,
        featured,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan produk ke database cloud.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-editor-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2
              id="product-editor-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-zinc-50"
            >
              {isEditing ? 'Edit Produk Digital' : 'Tambah Produk Digital Baru'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Produk yang disimpan langsung tersinkronisasi secara real-time ke seluruh pengunjung.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup editor produk"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form id="product-editor-form" onSubmit={handleSubmit} className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Basic Info */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Nama Produk
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Sistem Desain SaaS Nusantara"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Kategori
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Atau Buat Kategori Baru (Opsional)
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Mis. Template Notion"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Harga Jual (IDR)
              </label>
              <input
                type="number"
                min={0}
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Harga Coret / Normal (Opsional)
              </label>
              <input
                type="number"
                min={0}
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="Kosongkan jika tanpa diskon"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Slug URL SEO (Opsional)
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="otomatis-dari-nama-produk"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Format Paket
              </label>
              <input
                type="text"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="PDF + Checklist / ZIP Source Code"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Stock & Visibility */}
          <div className="grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-3 dark:border-zinc-800">
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={unlimitedStock}
                  onChange={(e) => setUnlimitedStock(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Stok Tak Terbatas</span>
              </label>
              {!unlimitedStock && (
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="mt-2 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Status Tayang
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'draft')}
                className="mt-1.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="active">Aktif di Katalog</option>
                <option value="draft">Draft (Tersembunyi)</option>
              </select>
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Tampilkan sebagai Unggulan</span>
              </label>
            </div>
          </div>

          {/* Digital File Metadata & Private Download Link */}
          <div className="space-y-4 border-t border-slate-200 pt-5 dark:border-zinc-800">
            <div>
              <label
                htmlFor="product-download-url"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300"
              >
                <Link2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                <span>Link Download Aplikasi / Produk (Diberikan Setelah Transaksi Sukses)</span>
              </label>
              <input
                id="product-download-url"
                type="url"
                maxLength={600}
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                placeholder="https://drive.google.com/... atau link APK / MediaFire / GitHub"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                Disimpan privat khusus Admin dan tidak terlihat di halaman katalog publik. Tautan ini otomatis terbuka di layar pembeli &amp; dikirim via Telegram hanya setelah pembayaran diverifikasi Lunas.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Info Nama &amp; Ukuran File (Opsional)
              </label>
              <div className="mt-2 flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:bg-zinc-950">
                <div className="min-w-0">
                  {fileName ? (
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-zinc-100">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      <span className="truncate">{fileName}</span>
                      {fileSize && (
                        <span className="font-mono text-xs text-slate-500 dark:text-zinc-400">
                          ({fileSize})
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                      Pilih file lokal untuk mencatat label nama &amp; ukuran file (APK, ZIP, PDF, FIG, dsb.).
                    </p>
                  )}
                </div>
                <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
                  <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pilih File</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const selected = e.target.files?.[0];
                      if (selected) handleSelectFile(selected);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Cover Image Upload, Gallery Assets, Presets & URL */}
          <div className="space-y-4 border-t border-slate-200 pt-5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Sampul Produk (Unggah dari HP/Komputer, Pilih Galeri, atau URL HTTPS)
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{uploadingCover ? 'Mengunggah...' : 'Unggah Foto'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    disabled={uploadingCover}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      void handleUploadCoverImage(f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setCoverImage(PRESET_PRODUCT_COVERS[0].path)}
                  className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Active Cover Preview + URL input */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="aspect-4/3 w-32 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-950">
                <SafeImage
                  src={coverImage}
                  alt={title || 'Pratinjau sampul'}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input
                  type="text"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="https://... atau unggah foto dari perangkat"
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Foto yang diunggah otomatis dikompresi &amp; tersimpan di tab Galeri Aset agar bisa dipakai ulang kapan saja.
                </p>
              </div>
            </div>

            {/* Custom Uploaded Gallery Assets */}
            {mediaAssets.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                  Aset Galeri Anda ({mediaAssets.length})
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                  {mediaAssets.map((asset) => {
                    const uri = toAssetUri(asset.id);
                    const selected = coverImage === uri || coverImage === asset.url;
                    return (
                      <div
                        key={asset.id}
                        className={`group relative overflow-hidden rounded-lg border transition-all ${
                          selected
                            ? 'border-blue-600 ring-2 ring-blue-600/30'
                            : 'border-slate-200 opacity-85 hover:opacity-100 dark:border-zinc-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setCoverImage(uri)}
                          className="block w-full cursor-pointer text-left"
                        >
                          <div className="aspect-4/3 bg-slate-100 dark:bg-zinc-950">
                            <SafeImage
                              src={uri}
                              alt={asset.label}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </button>
                        <button
                          type="button"
                          disabled={deletingAssetId === asset.id}
                          onClick={() => void handleQuickDeleteAsset(asset)}
                          aria-label={`Hapus aset ${asset.label}`}
                          title="Hapus aset dari galeri"
                          className="absolute top-1 right-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-slate-950/75 text-white opacity-90 hover:bg-red-600"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Built-in Studio Presets */}
            <div>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                Preset Bawaan Studio
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                {PRESET_PRODUCT_COVERS.map((preset) => {
                  const selected = coverImage === preset.path;
                  return (
                    <button
                      key={preset.path}
                      type="button"
                      onClick={() => setCoverImage(preset.path)}
                      className={`cursor-pointer overflow-hidden rounded-lg border text-left transition-all ${
                        selected
                          ? 'border-blue-600 ring-2 ring-blue-600/30'
                          : 'border-slate-200 opacity-80 hover:opacity-100 dark:border-zinc-800'
                      }`}
                    >
                      <div className="aspect-4/3 bg-slate-100 dark:bg-zinc-950">
                        <SafeImage
                          src={preset.path}
                          alt={preset.label}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Descriptions & Highlights */}
          <div className="space-y-4 border-t border-slate-200 pt-5 dark:border-zinc-800">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Ringkasan Singkat (Tampil di Kartu Katalog)
              </label>
              <input
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="1-2 kalimat ringkas tentang manfaat utama produk..."
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Deskripsi Lengkap
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan detail isi paket, kompatibilitas, dan cakupan lisensi..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Poin Keunggulan / Isi Paket
                </label>
                <button
                  type="button"
                  onClick={() => setHighlights((prev) => [...prev, ''])}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Poin</span>
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {highlights.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) =>
                        setHighlights((prev) =>
                          prev.map((v, i) => (i === idx ? e.target.value : v)),
                        )
                      }
                      placeholder="Contoh: Kompatibel Tailwind CSS v4"
                      className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      aria-label="Hapus poin"
                      onClick={() => setHighlights((prev) => prev.filter((_, i) => i !== idx))}
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 dark:border-zinc-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/60">
          <button
            type="button"
            onClick={onClose}
            className="h-10 cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Batal
          </button>
          <button
            type="submit"
            form="product-editor-form"
            disabled={saving}
            style={{ backgroundColor: 'var(--store-accent)' }}
            className="h-10 cursor-pointer rounded-lg px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Terbitkan Produk'}
          </button>
        </div>
      </div>
    </div>
  );
}
