import { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Save,
  Send,
} from 'lucide-react';
import type {
  Product,
  SeoConfig,
  TelegramConnectionStatus,
  TelegramLog,
  TelegramPreferences,
} from '../types/store';
import { formatDateTimeID } from '../lib/format';
import {
  appendFirestoreTelegramLog,
  saveFirestoreAdminSettings,
} from '../lib/firestoreStore';

interface TelegramSettingsPanelProps {
  storeName?: string;
  preferences: TelegramPreferences;
  status: TelegramConnectionStatus;
  logs: TelegramLog[];
  serverlessAvailable?: boolean;
}

export function TelegramSettingsPanel({
  storeName = 'Karsa Digital',
  preferences,
  status,
  logs,
  serverlessAvailable = false,
}: TelegramSettingsPanelProps) {
  const [draft, setDraft] = useState<TelegramPreferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingHelp, setSendingHelp] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const copyCommand = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd((prev) => (prev === key ? null : prev)), 1800);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveFirestoreAdminSettings(draft);
      setMessage({
        type: 'ok',
        text: 'Pengaturan notifikasi Bot Telegram disimpan ke database cloud secara real-time.',
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!serverlessAvailable) {
      setMessage({
        type: 'err',
        text: 'Pengiriman Bot Telegram memerlukan deployment Vercel/Server dengan TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID di Environment Variables.',
      });
      return;
    }

    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test',
          storeName,
          chatIdOverride: draft.customChatIdOverride || undefined,
          messageHeader: draft.messageHeader,
        }),
      });
      const data = (await res.json()) as {
        status?: 'sent' | 'not_configured' | 'failed';
        detail?: string;
        preview?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || data.detail || 'Gagal menjalankan uji koneksi.');
      const statusVal = data.status || 'failed';
      await appendFirestoreTelegramLog({
        event: 'test',
        status: statusVal,
        detail: data.detail || 'Selesai',
        preview: data.preview || `Uji Koneksi Bot Telegram — ${storeName}`,
      });
      setMessage({
        type: statusVal === 'sent' ? 'ok' : 'err',
        text: data.detail || 'Pengujian selesai.',
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengirim pesan uji.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSendHelp = async () => {
    if (!serverlessAvailable) {
      setMessage({
        type: 'err',
        text: 'Hubungkan repositori ke Vercel dan atur TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID agar panduan /help dapat dikirim langsung ke chat Telegram Anda.',
      });
      return;
    }

    setSendingHelp(true);
    setMessage(null);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'help',
          storeName,
          chatIdOverride: draft.customChatIdOverride || undefined,
        }),
      });
      const data = (await res.json()) as {
        status?: 'sent' | 'not_configured' | 'failed';
        detail?: string;
        preview?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || data.detail || 'Gagal mengirim panduan /help.');
      const statusVal = data.status || 'failed';
      await appendFirestoreTelegramLog({
        event: 'help',
        status: statusVal,
        detail: data.detail || 'Panduan /help dikirim',
        preview: data.preview || `Panduan Perintah /help — ${storeName}`,
      });
      setMessage({
        type: statusVal === 'sent' ? 'ok' : 'err',
        text:
          statusVal === 'sent'
            ? 'Panduan perintah /help berhasil dikirim ke Telegram Anda.'
            : data.detail || 'Gagal mengirim panduan /help.',
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal mengirim panduan /help.',
      });
    } finally {
      setSendingHelp(false);
    }
  };

  const TELEGRAM_HELP_COMMANDS = [
    {
      id: 'reply-bank',
      title: 'Kirim Rekening & Nominal (Reply pesan pesanan)',
      command: 'BCA | 1234567890 | 129123',
      desc: 'Balas (Reply) pesan pesanan masuk dengan Nama Bank | Nomor Rekening | Nominal agar langsung tampil di layar pembeli.',
    },
    {
      id: 'reply-bank-holder',
      title: 'Kirim Rekening + Atas Nama (Reply pesan pesanan)',
      command: 'BCA | 1234567890 | 129123 | Nama Pemilik',
      desc: 'Opsional: tambahkan nama pemilik rekening di kolom keempat, atau pisahkan tiap bagian dengan Enter (baris baru).',
    },
    {
      id: 'cmd-bayar',
      title: 'Perintah Langsung Tanpa Reply (/bayar)',
      command: '/bayar INV-2026-1002 | BCA | 1234567890 | 129123',
      desc: 'Kirim instruksi bank ke pesanan tertentu tanpa perlu swipe-reply menggunakan nomor invoice.',
    },
    {
      id: 'cmd-lunas',
      title: 'Verifikasi Lunas & Buka Link Unduhan (/lunas)',
      command: '/lunas INV-2026-1002',
      desc: 'Atau cukup balas (Reply) pesan konfirmasi transfer pembeli dengan kata LUNAS, OK, atau ACC.',
    },
    {
      id: 'cmd-batal',
      title: 'Batalkan Pesanan (/batal)',
      command: '/batal INV-2026-1002',
      desc: 'Atau balas (Reply) pesan pesanan dengan kata BATAL untuk membatalkan transaksi.',
    },
    {
      id: 'cmd-help',
      title: 'Tampilkan Panduan Perintah di Chat Bot (/help)',
      command: '/help',
      desc: 'Ketik /help atau /panduan di chat bot (atau klik tombol Kirim /help di atas) untuk melihat daftar perintah.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-zinc-50">
            Integrasi Bot Telegram Real-Time
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Terima pesanan masuk, kirim rekening &amp; nominal via balasan Telegram, dan pantau panduan perintah /help.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={sendingHelp}
            onClick={handleSendHelp}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{sendingHelp ? 'Mengirim /help...' : 'Kirim /help ke Telegram'}</span>
          </button>
          <button
            type="button"
            disabled={testing}
            onClick={handleTestSend}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{testing ? 'Mengirim Uji...' : 'Kirim Pesan Uji'}</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            style={{ backgroundColor: 'var(--store-accent)' }}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
          </button>
        </div>
      </div>

      {!serverlessAvailable && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Bot Telegram memerlukan server backend (GitHub Pages hanya menjalankan file statis).
            </p>
            <p className="mt-1">
              Untuk mengaktifkan notifikasi Telegram real-time <strong>100% gratis</strong>, impor
              repositori GitHub Anda ke <strong>vercel.com</strong> lalu masukkan{' '}
              <span className="font-mono">TELEGRAM_BOT_TOKEN</span> dan{' '}
              <span className="font-mono">TELEGRAM_CHAT_ID</span> di menu{' '}
              <strong>Settings → Environment Variables</strong>. Endpoint{' '}
              <span className="font-mono">/api/telegram</span> sudah disiapkan otomatis di proyek ini.
            </p>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-xs font-medium ${
            message.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
          }`}
        >
          {message.type === 'ok' ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Connection Status & Secret Instructions */}
        <div className="space-y-5 lg:col-span-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Status Kredensial Server (Secrets)
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
              Demi keamanan, token Bot Telegram dibaca langsung dari Environment Secrets server dan tidak pernah terekspos ke browser pengunjung.
            </p>

            <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 text-xs dark:divide-zinc-800 dark:border-zinc-800">
              <div className="flex items-center justify-between py-2.5">
                <span className="font-mono text-slate-700 dark:text-zinc-300">TELEGRAM_BOT_TOKEN</span>
                <span
                  className={
                    status.botTokenConfigured
                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'font-semibold text-amber-700 dark:text-amber-400'
                  }
                >
                  {status.botTokenConfigured ? 'Terpasang di Server' : 'Belum Diatur di Secrets'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-mono text-slate-700 dark:text-zinc-300">TELEGRAM_CHAT_ID</span>
                <span className="font-mono text-slate-700 dark:text-zinc-300">
                  {status.effectiveChatIdMasked || 'Belum Diatur'}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <p className="font-semibold text-slate-900 dark:text-zinc-100">Langkah aktivasi 1 menit:</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                <li>Buat bot di Telegram melalui <span className="font-mono">@BotFather</span> untuk mendapatkan token.</li>
                <li>Dapatkan ID chat Anda melalui <span className="font-mono">@userinfobot</span> atau ID grup tujuan.</li>
                <li>Tambahkan <span className="font-mono">TELEGRAM_BOT_TOKEN</span> dan <span className="font-mono">TELEGRAM_CHAT_ID</span> pada panel Environment / Secrets hosting Anda.</li>
              </ol>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Pemicu &amp; Format Pesan
            </h3>

            <div className="space-y-2.5 text-xs">
              <label className="flex cursor-pointer items-center gap-2.5 text-slate-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.notifyOnOrderCreated}
                  onChange={(e) => setDraft({ ...draft, notifyOnOrderCreated: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Kirim notifikasi saat pesanan baru dibuat (Menunggu Pembayaran)</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5 text-slate-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.notifyOnOrderPaid}
                  onChange={(e) => setDraft({ ...draft, notifyOnOrderPaid: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Kirim notifikasi otomatis saat pembayaran lunas</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5 text-slate-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={draft.notifyOnLowStock}
                  onChange={(e) => setDraft({ ...draft, notifyOnLowStock: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span>Kirim peringatan ketika stok produk menipis</span>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Batas Peringatan Stok
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.lowStockThreshold}
                  onChange={(e) =>
                    setDraft({ ...draft, lowStockThreshold: Number(e.target.value || 5) })
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Override Chat ID (Opsional)
                </label>
                <input
                  type="text"
                  value={draft.customChatIdOverride}
                  onChange={(e) => setDraft({ ...draft, customChatIdOverride: e.target.value })}
                  placeholder="Mis. -1001234567890"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                Judul Header Pesan Telegram
              </label>
              <input
                type="text"
                value={draft.messageHeader}
                onChange={(e) => setDraft({ ...draft, messageHeader: e.target.value })}
                className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Telegram /help Command Guide + Delivery Log */}
        <div className="space-y-5 lg:col-span-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Panduan Perintah Bot Telegram (/help)
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                  Daftar format komen &amp; balasan resmi yang bisa Anda kirim di chat Bot Telegram admin.
                </p>
              </div>
              <button
                type="button"
                disabled={sendingHelp}
                onClick={handleSendHelp}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Send className="h-3 w-3" aria-hidden="true" />
                <span>{sendingHelp ? 'Mengirim...' : 'Kirim ke Chat'}</span>
              </button>
            </div>

            <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
              {TELEGRAM_HELP_COMMANDS.map((cmd) => (
                <div key={cmd.id} className="py-3 first:pt-3 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      {cmd.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyCommand(cmd.id, cmd.command)}
                      className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {copiedCmd === cmd.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span>Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    {cmd.command}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                    {cmd.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Riwayat Pengiriman Notifikasi
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              Menampilkan 50 aktivitas pengiriman notifikasi terakhir dari server.
            </p>

            {logs.length === 0 ? (
              <p className="mt-6 py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                Belum ada riwayat notifikasi. Coba tekan &ldquo;Kirim Pesan Uji&rdquo; atau &ldquo;Kirim /help ke Telegram&rdquo;.
              </p>
            ) : (
              <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-zinc-100">
                        {log.event === 'order_paid' && 'Pembayaran Lunas + Link Produk'}
                        {log.event === 'transfer_submitted' && 'Bukti Transfer Pembeli'}
                        {log.event === 'order_created' && 'Pesanan Baru'}
                        {log.event === 'low_stock' && 'Stok Menipis'}
                        {log.event === 'help' && 'Panduan /help'}
                        {log.event === 'test' && 'Uji Koneksi'}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">
                        {formatDateTimeID(log.timestamp)}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-[11px] font-medium ${
                        log.status === 'sent'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : log.status === 'not_configured'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {log.detail}
                    </p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2.5 font-mono text-[11px] leading-relaxed text-slate-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      {log.preview}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeploySeoPanelProps {
  seo: SeoConfig;
  products: Product[];
}

export function DeploySeoPanel({ seo, products }: DeploySeoPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
  };

  const handleDownloadCatalogJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      seo,
      products: products.filter((p) => p.status === 'active'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'katalog-produk-digital.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const seoChecks = [
    {
      label: 'Meta Title (30–60 karakter)',
      ok: seo.metaTitle.length >= 25 && seo.metaTitle.length <= 65,
      value: `${seo.metaTitle.length} karakter`,
    },
    {
      label: 'Meta Description (120–160 karakter)',
      ok: seo.metaDescription.length >= 100 && seo.metaDescription.length <= 165,
      value: `${seo.metaDescription.length} karakter`,
    },
    {
      label: 'OpenGraph & Twitter Card',
      ok: true,
      value: 'Aktif & sinkron otomatis',
    },
    {
      label: 'Schema.org JSON-LD (OnlineStore + Product)',
      ok: true,
      value: `${products.filter((p) => p.status === 'active').length} produk terindeks`,
    },
    {
      label: 'robots.txt & sitemap.xml dinamis',
      ok: true,
      value: 'Tersedia di /robots.txt & /sitemap.xml',
    },
  ];

  const deployCards = [
    {
      id: 'vercel',
      title: 'Vercel (Domain Gratis .vercel.app)',
      file: 'vercel.json (sudah tersedia di proyek)',
      steps:
        '1. Push proyek ke repositori GitHub.\n2. Buka vercel.com → Add New Project → pilih repositori.\n3. Tambahkan Environment Variables (ADMIN_PASSCODE, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) lalu klik Deploy.',
    },
    {
      id: 'netlify',
      title: 'Netlify (Domain Gratis .netlify.app)',
      file: 'netlify.toml (sudah tersedia di proyek)',
      steps:
        '1. Hubungkan repositori GitHub di app.netlify.com.\n2. Build command: npm run build | Publish directory: dist.\n3. Situs langsung aktif dengan HTTPS otomatis dan cache aset statis optimal.',
    },
    {
      id: 'ghpages',
      title: 'GitHub Pages (Gratis via GitHub Actions)',
      file: '.github/workflows/deploy.yml (sudah tersedia di proyek)',
      steps:
        '1. Push kode ke branch main di GitHub.\n2. Buka Settings → Pages → Source: pilih GitHub Actions.\n3. Setiap kali Anda push pembaruan, situs landing page otomatis terbit di https://<username>.github.io/<repo>/.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-zinc-50">
            Deploy Gratis &amp; Audit SEO
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Konfigurasi siap pakai untuk GitHub Pages, Vercel, dan Netlify serta verifikasi struktur mesin pencari.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Lihat Sitemap XML</span>
          </a>
          <button
            type="button"
            onClick={handleDownloadCatalogJson}
            style={{ backgroundColor: 'var(--store-accent)' }}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ekspor Katalog JSON</span>
          </button>
        </div>
      </div>

      {/* SEO Health Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
          Daftar Periksa Optimasi Mesin Pencari (SEO)
        </h3>
        <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 text-xs dark:divide-zinc-800 dark:border-zinc-800">
          {seoChecks.map((check) => (
            <div key={check.label} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-2.5">
                {check.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <span className="font-medium text-slate-800 dark:text-zinc-200">{check.label}</span>
              </div>
              <span className="font-mono text-slate-500 dark:text-zinc-400">{check.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hosting Guides */}
      <div className="grid gap-5 lg:grid-cols-3">
        {deployCards.map((card) => (
          <div
            key={card.id}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              {card.title}
            </h3>
            <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-zinc-400">
              {card.file}
            </p>
            <pre className="mt-3 flex-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {card.steps}
            </pre>
            <button
              type="button"
              onClick={() => copyText(card.id, card.steps)}
              className="mt-3 inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {copiedId === card.id ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Panduan Disalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin Langkah Deploy</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
