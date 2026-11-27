import { useState } from 'react';
import { Check, RotateCcw, Save } from 'lucide-react';
import type { CornerStyle, SeoConfig, ThemeConfig } from '../types/store';
import { PRESET_ACCENT_COLORS, PRESET_PRODUCT_COVERS, getRadiusPx } from '../lib/format';
import { saveStaticSettings } from '../lib/staticFallback';
import { SafeImage } from './SafeImage';

interface ThemeEditorPanelProps {
  theme: ThemeConfig;
  seo: SeoConfig;
  adminToken: string;
  isStaticMode?: boolean;
  onSaved: () => void;
}

export function ThemeEditorPanel({
  theme,
  seo,
  adminToken,
  isStaticMode = false,
  onSaved,
}: ThemeEditorPanelProps) {
  const [draftTheme, setDraftTheme] = useState<ThemeConfig>(theme);
  const [draftSeo, setDraftSeo] = useState<SeoConfig>(seo);
  const [previewDark, setPreviewDark] = useState(theme.defaultMode === 'dark');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      if (isStaticMode) {
        saveStaticSettings({ theme: draftTheme, seo: draftSeo });
        setFeedback('Tampilan dan metadata SEO disimpan secara lokal di browser.');
        onSaved();
        return;
      }
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          theme: draftTheme,
          seo: draftSeo,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan tema.');
      setFeedback('Tampilan dan metadata SEO berhasil disimpan ke situs utama.');
      onSaved();
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
      if (isStaticMode) {
        const next = saveStaticSettings({ resetTheme: true });
        setDraftTheme(next.theme);
        setDraftSeo(next.seo);
        setFeedback('Tema dikembalikan ke pengaturan standar.');
        onSaved();
        return;
      }
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ resetTheme: true }),
      });
      const data = (await res.json()) as {
        overview?: { settings: { theme: ThemeConfig; seo: SeoConfig } };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Gagal mereset tema.');
      if (data.overview?.settings) {
        setDraftTheme(data.overview.settings.theme);
        setDraftSeo(data.overview.settings.seo);
      }
      setFeedback('Tema dikembalikan ke pengaturan standar.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset tema.');
    } finally {
      setSaving(false);
    }
  };

  const previewRadius = getRadiusPx(draftTheme.cornerStyle);
  const titleLen = draftSeo.metaTitle.trim().length;
  const descLen = draftSeo.metaDescription.trim().length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-zinc-50">
            Editor Tampilan &amp; SEO Tanpa Coding
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Sesuaikan identitas brand, warna aksen, gaya kartu, tata letak katalog, dan tag SEO secara visual.
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
          {/* Identitas & Copy Hero */}
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
                  value={draftTheme.heroSubheadline}
                  onChange={(e) =>
                    setDraftTheme({ ...draftTheme, heroSubheadline: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Teks Tombol Utama
                </label>
                <input
                  type="text"
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
                  value={draftTheme.contactEmail}
                  onChange={(e) => setDraftTheme({ ...draftTheme, contactEmail: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>
          </section>

          {/* Gaya Visual & Warna */}
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

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Gambar Hero
              </label>
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

          {/* Pengaturan SEO On-Page */}
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
                <span className="font-display text-sm font-bold">{draftTheme.storeName}</span>
                <div className="flex items-center gap-4 text-[11px] opacity-75">
                  <span>Katalog</span>
                  <span>Keunggulan</span>
                  <span
                    style={{
                      backgroundColor: draftTheme.accentColor,
                      borderRadius: previewRadius,
                    }}
                    className="px-2.5 py-1 font-semibold text-white opacity-100"
                  >
                    Keranjang
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
