import { useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  RotateCcw,
  Save,
  Share2,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import type {
  CornerStyle,
  MediaAsset,
  SeoConfig,
  SocialLinks,
  StoreUiTexts,
  ThemeConfig,
} from '../types/store';
import { PRESET_ACCENT_COLORS, PRESET_PRODUCT_COVERS, getRadiusPx } from '../lib/format';
import { compressImageFileToDataUrl, toAssetUri } from '../lib/mediaAssets';
import {
  createFirestoreMediaAsset,
  deleteFirestoreMediaAsset,
  saveFirestorePublicSettings,
} from '../lib/firestoreStore';
import { getDefaultStaticSettings } from '../lib/staticFallback';
import { SafeImage } from './SafeImage';

interface ThemeEditorPanelProps {
  theme: ThemeConfig;
  seo: SeoConfig;
  mediaAssets: MediaAsset[];
}

function normalizeSocialUrlInput(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const candidate =
    trimmed.startsWith('https://') || trimmed.startsWith('http://')
      ? trimmed
      : trimmed.includes('.')
        ? `https://${trimmed}`
        : '';
  if (!candidate || candidate.length > 300) {
    throw new Error(
      `Format tautan ${label} tidak valid. Masukkan alamat lengkap seperti https://...`,
    );
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('protocol');
    }
    return parsed.toString();
  } catch {
    throw new Error(
      `Format tautan ${label} tidak valid. Masukkan alamat lengkap seperti https://...`,
    );
  }
}

export function ThemeEditorPanel({ theme, seo, mediaAssets }: ThemeEditorPanelProps) {
  const defaultTheme = getDefaultStaticSettings().theme;
  const [draftTheme, setDraftTheme] = useState<ThemeConfig>(() => ({
    ...defaultTheme,
    ...theme,
    socialLinks: {
      ...defaultTheme.socialLinks!,
      ...(theme.socialLinks || {}),
    },
    uiTexts: {
      ...defaultTheme.uiTexts!,
      ...(theme.uiTexts || {}),
    },
  }));
  const [draftSeo, setDraftSeo] = useState<SeoConfig>(seo);
  const [previewDark, setPreviewDark] = useState(theme.defaultMode === 'dark');
  const [saving, setSaving] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socialLinks: SocialLinks = draftTheme.socialLinks || defaultTheme.socialLinks!;
  const uiTexts: StoreUiTexts = draftTheme.uiTexts || defaultTheme.uiTexts!;
  const uploadedAssets = mediaAssets.filter((a) => a.sourceType === 'upload');

  const updateSocial = (key: keyof SocialLinks, value: string) => {
    setDraftTheme((prev) => ({
      ...prev,
      socialLinks: {
        ...(prev.socialLinks || defaultTheme.socialLinks!),
        [key]: value,
      },
    }));
  };

  const updateUiText = (key: keyof StoreUiTexts, value: string) => {
    setDraftTheme((prev) => ({
      ...prev,
      uiTexts: {
        ...(prev.uiTexts || defaultTheme.uiTexts!),
        [key]: value,
      },
    }));
  };

  const handleUploadHeroImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFeedback(null);
    setUploadingHero(true);
    try {
      const compressed = await compressImageFileToDataUrl(file);
      const cleanName =
        file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Banner Hero';
      const created = await createFirestoreMediaAsset({
        label: cleanName.slice(0, 120),
        category: 'hero',
        sourceType: 'upload',
        url: compressed.dataUrl,
        mimeType: compressed.mimeType,
        width: compressed.width,
        height: compressed.height,
        sizeBytes: compressed.sizeBytes,
      });
      setDraftTheme((prev) => ({ ...prev, heroImage: toAssetUri(created.id) }));
      setFeedback(
        'Gambar Hero dari perangkat Anda berhasil diunggah. Klik "Simpan Perubahan" untuk menerapkannya ke toko.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah gambar Hero.');
    } finally {
      setUploadingHero(false);
    }
  };

  const handleDeleteHeroAsset = async (asset: MediaAsset) => {
    setError(null);
    setDeletingAssetId(asset.id);
    try {
      const uri = toAssetUri(asset.id);
      await deleteFirestoreMediaAsset(asset.id);
      if (draftTheme.heroImage === uri || draftTheme.heroImage === asset.url) {
        setDraftTheme((prev) => ({
          ...prev,
          heroImage: PRESET_PRODUCT_COVERS[4].path,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus aset gambar.');
    } finally {
      setDeletingAssetId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const cleanedSocial: SocialLinks = {
        youtube: normalizeSocialUrlInput(socialLinks.youtube, 'YouTube'),
        tiktok: normalizeSocialUrlInput(socialLinks.tiktok, 'TikTok'),
        instagram: normalizeSocialUrlInput(socialLinks.instagram, 'Instagram'),
        whatsapp: normalizeSocialUrlInput(socialLinks.whatsapp, 'WhatsApp'),
      };

      const nextDraft: ThemeConfig = {
        ...draftTheme,
        socialLinks: cleanedSocial,
        uiTexts,
      };
      const saved = await saveFirestorePublicSettings({ theme: nextDraft, seo: draftSeo });
      setDraftTheme({
        ...defaultTheme,
        ...saved.theme,
        socialLinks: {
          ...defaultTheme.socialLinks!,
          ...(saved.theme.socialLinks || {}),
        },
        uiTexts: {
          ...defaultTheme.uiTexts!,
          ...(saved.theme.uiTexts || {}),
        },
      });
      setFeedback(
        'Tampilan, teks menu, tautan medsos, dan SEO tersimpan di cloud & langsung aktif untuk semua pengunjung.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const next = await saveFirestorePublicSettings({ resetTheme: true });
      setDraftTheme({
        ...defaultTheme,
        ...next.theme,
        socialLinks: {
          ...defaultTheme.socialLinks!,
          ...(next.theme.socialLinks || {}),
        },
        uiTexts: {
          ...defaultTheme.uiTexts!,
          ...(next.theme.uiTexts || {}),
        },
      });
      setDraftSeo(next.seo);
      setFeedback('Tema & teks tampilan dikembalikan ke pengaturan standar secara real-time.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset tema.');
    } finally {
      setSaving(false);
    }
  };

  const previewRadius = getRadiusPx(draftTheme.cornerStyle);
  const titleLen = draftSeo.metaTitle.trim().length;
  const descLen = draftSeo.metaDescription.trim().length;
  const activeSocialBadges = [
    socialLinks.youtube.trim() ? 'YouTube' : null,
    socialLinks.tiktok.trim() ? 'TikTok' : null,
    socialLinks.instagram.trim() ? 'Instagram' : null,
    socialLinks.whatsapp.trim() ? 'WhatsApp' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-zinc-50">
            Editor Tampilan, Menu &amp; Media Sosial
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Atur gambar hero dari perangkat, ubah teks menu dan halaman toko, pasang tautan YouTube/TikTok/Instagram, serta kelola SEO.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={handleReset}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Default</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            style={{ backgroundColor: draftTheme.accentColor }}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left Controls */}
        <div className="space-y-6 lg:col-span-6">
          {/* 1. Identitas & Copy Hero */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Identitas &amp; Konten Hero
            </h3>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Nama Toko / Brand
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={draftTheme.storeName}
                  onChange={(e) => setDraftTheme({ ...draftTheme, storeName: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Label Pengantar Hero
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={draftTheme.heroEyebrow}
                  onChange={(e) => setDraftTheme({ ...draftTheme, heroEyebrow: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Judul Utama Hero
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={draftTheme.heroHeadline}
                  onChange={(e) => setDraftTheme({ ...draftTheme, heroHeadline: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Subjudul Hero
                </label>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={draftTheme.heroSubheadline}
                  onChange={(e) =>
                    setDraftTheme({ ...draftTheme, heroSubheadline: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Teks Tombol Utama Hero
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={draftTheme.heroCtaText}
                  onChange={(e) => setDraftTheme({ ...draftTheme, heroCtaText: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Email Kontak Footer
                </label>
                <input
                  type="email"
                  maxLength={160}
                  value={draftTheme.contactEmail}
                  onChange={(e) => setDraftTheme({ ...draftTheme, contactEmail: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>
          </section>

          {/* 2. Gambar Hero (Langsung dari File HP / Laptop — Tanpa Input HTTPS) */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-500 dark:text-zinc-400" aria-hidden="true" />
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Gambar Hero (Dari File HP / Laptop)
                </h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftTheme((prev) => ({
                    ...prev,
                    heroImage: PRESET_PRODUCT_COVERS[4].path,
                  }))
                }
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Reset Standar</span>
              </button>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 sm:flex-row sm:items-center dark:border-zinc-700 dark:bg-zinc-950">
              <div className="aspect-4/3 w-full shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white sm:w-36 dark:border-zinc-800 dark:bg-zinc-900">
                <SafeImage
                  src={draftTheme.heroImage}
                  alt="Gambar Hero aktif"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-zinc-100">
                  Pilih foto langsung dari galeri HP atau folder laptop Anda
                </p>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                  Format JPG, PNG, atau WebP akan dikompresi otomatis &amp; tersimpan langsung di database cloud tanpa perlu link eksternal.
                </p>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-950">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {uploadingHero ? 'Mengunggah Gambar...' : 'Unggah Gambar dari HP / Laptop'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    disabled={uploadingHero}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      void handleUploadHeroImage(f);
                    }}
                  />
                </label>
              </div>
            </div>

            {uploadedAssets.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                  Gambar Unggahan Anda ({uploadedAssets.length})
                </p>
                <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {uploadedAssets.map((asset) => {
                    const uri = toAssetUri(asset.id);
                    const selected = draftTheme.heroImage === uri || draftTheme.heroImage === asset.url;
                    return (
                      <div
                        key={asset.id}
                        className={`relative aspect-4/3 overflow-hidden rounded-lg border ${
                          selected
                            ? 'border-blue-600 ring-2 ring-blue-600/30'
                            : 'border-slate-200 opacity-85 hover:opacity-100 dark:border-zinc-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setDraftTheme({ ...draftTheme, heroImage: uri })}
                          className="h-full w-full cursor-pointer"
                        >
                          <SafeImage src={uri} alt={asset.label} className="h-full w-full object-cover" />
                        </button>
                        <button
                          type="button"
                          disabled={deletingAssetId === asset.id}
                          onClick={() => void handleDeleteHeroAsset(asset)}
                          aria-label={`Hapus ${asset.label}`}
                          className="absolute top-1 right-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded bg-slate-950/75 text-white hover:bg-red-600"
                        >
                          <Trash2 className="h-2.5 w-2.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                Preset Bawaan Studio
              </p>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {PRESET_PRODUCT_COVERS.map((img) => (
                  <button
                    key={img.path}
                    type="button"
                    onClick={() => setDraftTheme({ ...draftTheme, heroImage: img.path })}
                    className={`aspect-4/3 cursor-pointer overflow-hidden rounded-lg border ${
                      draftTheme.heroImage === img.path
                        ? 'border-blue-600 ring-2 ring-blue-600/30'
                        : 'border-slate-200 opacity-75 hover:opacity-100 dark:border-zinc-800'
                    }`}
                  >
                    <SafeImage src={img.path} alt={img.label} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 3. Editor Teks Menu & Tampilan Toko */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-slate-500 dark:text-zinc-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
                Editor Teks Menu &amp; Tampilan Toko
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Ubah label navigasi atas, judul bagian katalog, teks tombol produk, bagian keunggulan, dan catatan footer toko.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Menu 1 (Katalog)
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={uiTexts.navCatalog}
                  onChange={(e) => updateUiText('navCatalog', e.target.value)}
                  placeholder="Katalog"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Menu 2 (Keunggulan)
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={uiTexts.navFeatures}
                  onChange={(e) => updateUiText('navFeatures', e.target.value)}
                  placeholder="Keunggulan"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Tombol Keranjang
                </label>
                <input
                  type="text"
                  maxLength={40}
                  value={uiTexts.navCart}
                  onChange={(e) => updateUiText('navCart', e.target.value)}
                  placeholder="Keranjang"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Judul Bagian Katalog
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={uiTexts.catalogTitle}
                  onChange={(e) => updateUiText('catalogTitle', e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Teks Tombol Beli &amp; Detail
                </label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    maxLength={30}
                    value={uiTexts.buyButtonText}
                    onChange={(e) => updateUiText('buyButtonText', e.target.value)}
                    placeholder="Beli"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <input
                    type="text"
                    maxLength={30}
                    value={uiTexts.detailButtonText}
                    onChange={(e) => updateUiText('detailButtonText', e.target.value)}
                    placeholder="Detail"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Subjudul Bagian Katalog
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={uiTexts.catalogSubtitle}
                  onChange={(e) => updateUiText('catalogSubtitle', e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Judul Bagian Keunggulan
                </label>
                <input
                  type="text"
                  maxLength={180}
                  value={uiTexts.featuresTitle}
                  onChange={(e) => updateUiText('featuresTitle', e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Subjudul Bagian Keunggulan
                </label>
                <textarea
                  rows={2}
                  maxLength={360}
                  value={uiTexts.featuresSubtitle}
                  onChange={(e) => updateUiText('featuresSubtitle', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Catatan / Deskripsi Singkat Footer
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={draftTheme.footerNotice}
                  onChange={(e) => setDraftTheme({ ...draftTheme, footerNotice: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>
          </section>

          {/* 4. Tautan Media Sosial (YouTube, TikTok, Instagram, WhatsApp) */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-slate-500 dark:text-zinc-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
                Tautan Media Sosial Toko
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Tautan yang diisi akan tampil otomatis di bagian footer toko. Kosongkan jika tidak ingin ditampilkan.
            </p>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  YouTube
                </label>
                <input
                  type="url"
                  maxLength={300}
                  value={socialLinks.youtube}
                  onChange={(e) => updateSocial('youtube', e.target.value)}
                  placeholder="https://youtube.com/@akunanda"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  TikTok
                </label>
                <input
                  type="url"
                  maxLength={300}
                  value={socialLinks.tiktok}
                  onChange={(e) => updateSocial('tiktok', e.target.value)}
                  placeholder="https://tiktok.com/@akunanda"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Instagram
                </label>
                <input
                  type="url"
                  maxLength={300}
                  value={socialLinks.instagram}
                  onChange={(e) => updateSocial('instagram', e.target.value)}
                  placeholder="https://instagram.com/akunanda"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  WhatsApp (Opsional)
                </label>
                <input
                  type="url"
                  maxLength={300}
                  value={socialLinks.whatsapp}
                  onChange={(e) => updateSocial('whatsapp', e.target.value)}
                  placeholder="https://wa.me/6281234567890"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>
          </section>

          {/* 5. Palet Warna & Tata Letak */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Palet Warna &amp; Tata Letak
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Warna Aksen Utama
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {PRESET_ACCENT_COLORS.map((preset) => {
                  const selected = draftTheme.accentColor.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setDraftTheme({ ...draftTheme, accentColor: preset.value })}
                      className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs font-medium ${
                        selected
                          ? 'border-slate-900 bg-slate-100 text-slate-900 dark:border-zinc-100 dark:bg-zinc-800 dark:text-white'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-sm border border-black/15"
                        style={{ backgroundColor: preset.value }}
                        aria-hidden="true"
                      />
                      <span>{preset.name}</span>
                    </button>
                  );
                })}
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 dark:border-zinc-800 dark:text-zinc-300">
                  <input
                    type="color"
                    value={draftTheme.accentColor}
                    onChange={(e) => setDraftTheme({ ...draftTheme, accentColor: e.target.value })}
                    className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                  />
                  <span className="font-mono">{draftTheme.accentColor}</span>
                </label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Gaya Sudut Kartu
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-zinc-950">
                  {(['sharp', 'modern', 'soft'] as CornerStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setDraftTheme({ ...draftTheme, cornerStyle: style })}
                      className={`h-7 cursor-pointer rounded text-xs font-medium capitalize ${
                        draftTheme.cornerStyle === style
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      {style === 'sharp' ? 'Tegas' : style === 'modern' ? 'Modern' : 'Lembut'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Kolom Katalog
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-zinc-950">
                  {([2, 3] as const).map((cols) => (
                    <button
                      key={cols}
                      type="button"
                      onClick={() => setDraftTheme({ ...draftTheme, gridColumns: cols })}
                      className={`h-7 cursor-pointer rounded text-xs font-medium ${
                        draftTheme.gridColumns === cols
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      {cols} Kolom
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Tema Default
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-zinc-950">
                  {(['light', 'dark'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setDraftTheme({ ...draftTheme, defaultMode: mode });
                        setPreviewDark(mode === 'dark');
                      }}
                      className={`h-7 cursor-pointer rounded text-xs font-medium ${
                        draftTheme.defaultMode === mode
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-zinc-800 dark:text-white'
                          : 'text-slate-600 dark:text-zinc-400'
                      }`}
                    >
                      {mode === 'light' ? 'Terang' : 'Gelap'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 6. Pengaturan SEO On-Page */}
          <section className="space-y-3.5 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Optimasi SEO &amp; OpenGraph
            </h3>
            <div>
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-600 dark:text-zinc-400">Meta Title</label>
                <span className="font-mono tabular-nums text-slate-500">
                  {titleLen} / 60 karakter
                </span>
              </div>
              <input
                type="text"
                maxLength={160}
                value={draftSeo.metaTitle}
                onChange={(e) => setDraftSeo({ ...draftSeo, metaTitle: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-slate-600 dark:text-zinc-400">
                  Meta Description
                </label>
                <span className="font-mono tabular-nums text-slate-500">
                  {descLen} / 160 karakter
                </span>
              </div>
              <textarea
                rows={2}
                maxLength={400}
                value={draftSeo.metaDescription}
                onChange={(e) => setDraftSeo({ ...draftSeo, metaDescription: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Domain / Canonical URL
                </label>
                <input
                  type="url"
                  maxLength={300}
                  value={draftSeo.canonicalUrl}
                  onChange={(e) => setDraftSeo({ ...draftSeo, canonicalUrl: e.target.value })}
                  placeholder="https://tokoanda.vercel.app"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Kata Kunci SEO
                </label>
                <input
                  type="text"
                  maxLength={400}
                  value={draftSeo.keywords}
                  onChange={(e) => setDraftSeo({ ...draftSeo, keywords: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Right Live Preview */}
        <div className="space-y-4 lg:col-span-6">
          <div className="sticky top-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Pratinjau Langsung Toko
              </p>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setPreviewDark(false)}
                  className={`h-7 cursor-pointer rounded px-2.5 text-xs font-medium ${
                    !previewDark
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 dark:text-zinc-400'
                  }`}
                >
                  Terang
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDark(true)}
                  className={`h-7 cursor-pointer rounded px-2.5 text-xs font-medium ${
                    previewDark
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'text-slate-500 dark:text-zinc-400'
                  }`}
                >
                  Gelap
                </button>
              </div>
            </div>

            {/* Simulated Storefront Viewport */}
            <div
              className={`overflow-hidden rounded-xl border transition-colors ${
                previewDark
                  ? 'border-zinc-800 bg-zinc-950 text-zinc-100'
                  : 'border-slate-200 bg-white text-slate-900'
              }`}
            >
              {/* Mini Top Bar */}
              <div
                className={`flex items-center justify-between border-b px-5 py-3 ${
                  previewDark ? 'border-zinc-800' : 'border-slate-200'
                }`}
              >
                <span className="truncate font-display text-sm font-bold">
                  {draftTheme.storeName}
                </span>
                <div className="flex items-center gap-3.5 text-[11px] opacity-80">
                  <span className="truncate">{uiTexts.navCatalog || 'Katalog'}</span>
                  <span className="truncate">{uiTexts.navFeatures || 'Keunggulan'}</span>
                  <span
                    style={{
                      backgroundColor: draftTheme.accentColor,
                      borderRadius: previewRadius,
                    }}
                    className="px-2.5 py-1 font-semibold text-white opacity-100 whitespace-nowrap"
                  >
                    {uiTexts.navCart || 'Keranjang'}
                  </span>
                </div>
              </div>

              {/* Mini Hero */}
              <div className="grid gap-4 p-5 sm:grid-cols-12">
                <div className="flex flex-col justify-center sm:col-span-7">
                  <p className="text-[11px] opacity-65">{draftTheme.heroEyebrow}</p>
                  <h4 className="mt-1.5 font-display text-lg font-bold leading-tight">
                    {draftTheme.heroHeadline}
                  </h4>
                  <p className="mt-2 line-clamp-3 text-xs opacity-75">
                    {draftTheme.heroSubheadline}
                  </p>
                  <div className="mt-4">
                    <span
                      style={{
                        backgroundColor: draftTheme.accentColor,
                        borderRadius: previewRadius,
                      }}
                      className="inline-block px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      {draftTheme.heroCtaText}
                    </span>
                  </div>
                </div>
                <div className="sm:col-span-5">
                  <div
                    style={{ borderRadius: previewRadius }}
                    className="aspect-4/3 overflow-hidden border border-black/10"
                  >
                    <SafeImage
                      src={draftTheme.heroImage}
                      alt="Pratinjau hero"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Mini Catalog Heading + Social Links Preview */}
              <div
                className={`border-t px-5 py-3.5 ${
                  previewDark ? 'border-zinc-800' : 'border-slate-200'
                }`}
              >
                <p className="font-display text-xs font-bold">
                  {uiTexts.catalogTitle || 'Katalog Produk Digital'}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11px] opacity-70">
                  {uiTexts.catalogSubtitle}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span
                      style={{
                        backgroundColor: draftTheme.accentColor,
                        borderRadius: previewRadius,
                      }}
                      className="px-2.5 py-1 font-semibold text-white"
                    >
                      {uiTexts.buyButtonText || 'Beli'}
                    </span>
                    <span
                      style={{ borderRadius: previewRadius }}
                      className={`border px-2.5 py-1 font-medium ${
                        previewDark ? 'border-zinc-700' : 'border-slate-300'
                      }`}
                    >
                      {uiTexts.detailButtonText || 'Detail'}
                    </span>
                  </div>
                  {activeSocialBadges.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 opacity-80">
                      {activeSocialBadges.map((label) => (
                        <span
                          key={label}
                          className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                            previewDark ? 'border-zinc-700' : 'border-slate-300'
                          }`}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Mini Google Search Snippet Preview */}
              <div
                className={`border-t px-5 py-4 ${
                  previewDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <p className="text-[11px] font-semibold opacity-65">
                  Pratinjau Hasil Pencarian Google (SEO Snippet)
                </p>
                <p className="mt-2 truncate font-mono text-[11px] opacity-65">
                  {draftSeo.canonicalUrl || 'https://karsadigital.vercel.app'}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {draftSeo.metaTitle || draftTheme.storeName}
                </p>
                <p className="mt-1 line-clamp-2 text-xs opacity-75">
                  {draftSeo.metaDescription}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
