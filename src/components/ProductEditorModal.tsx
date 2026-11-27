import { useState } from 'react';
import { AlertCircle, Check, FileUp, Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';
import type { Product } from '../types/store';
import { PRESET_PRODUCT_COVERS } from '../lib/format';
import { SafeImage } from './SafeImage';

interface ProductEditorModalProps {
  open: boolean;
  product: Product | null;
  categories: string[];
  adminToken: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductEditorModal({
  open,
  product,
  categories,
  adminToken,
  onClose,
  onSaved,
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
  const [status, setStatus] = useState<'active' | 'draft'>(product?.status ?? 'active');
  const [featured, setFeatured] = useState(product?.featured ?? false);

  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleUpload = async (file: File, kind: 'product' | 'cover') => {
    setError(null);
    if (kind === 'product') setUploadingFile(true);
    else setUploadingCover(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/admin/upload?kind=${kind}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: formData,
      });
      const data = (await res.json()) as {
        fileKey?: string;
        fileName?: string;
        fileSize?: string;
        url?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Unggahan gagal.');
      }

      if (kind === 'product' && data.fileKey) {
        setFileKey(data.fileKey);
        setFileName(data.fileName || file.name);
        setFileSize(data.fileSize || '');
      } else if (kind === 'cover' && data.url) {
        setCoverImage(data.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah file.');
    } finally {
      if (kind === 'product') setUploadingFile(false);
      else setUploadingCover(false);
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

    setSaving(true);
    try {
      const endpoint = isEditing
        ? `/api/admin/products/${encodeURIComponent(product!.id)}`
        : '/api/admin/products';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
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
          status,
          featured,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan produk.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan produk.');
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
              Unggah file digital, atur harga, stok lisensi, dan kategori katalog.
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

          {/* Digital File Upload */}
          <div className="border-t border-slate-200 pt-5 dark:border-zinc-800">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              File Produk Digital (Diunduh Pembeli Setelah Lunas)
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
                    Mendukung ZIP, PDF, FIG, JSON, DOCX, XLSX, PNG/JPG hingga 25 MB.
                  </p>
                )}
              </div>
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{uploadingFile ? 'Mengunggah...' : 'Unggah File'}</span>
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingFile}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) handleUpload(selected, 'product');
                  }}
                />
              </label>
            </div>
          </div>

          {/* Cover Image Upload & Presets */}
          <div className="border-t border-slate-200 pt-5 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Sampul Produk (Rasio 4:3)
              </label>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{uploadingCover ? 'Mengunggah...' : 'Unggah Gambar'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingCover}
                  onChange={(e) => {
                    const selected = e.target.files?.[0];
                    if (selected) handleUpload(selected, 'cover');
                  }}
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {PRESET_PRODUCT_COVERS.map((preset) => {
                const selected = coverImage === preset.path;
                return (
                  <button
                    key={preset.path}
                    type="button"
                    onClick={() => setCoverImage(preset.path)}
                    className={`overflow-hidden rounded-lg border text-left transition-all ${
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
            disabled={saving || uploadingFile || uploadingCover}
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
