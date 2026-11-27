import { useState } from 'react';
import { AlertCircle, Check, Save } from 'lucide-react';
import type {
  PaymentGatewayProvider,
  PaymentGatewayStatus,
  PaymentMethodConfig,
  PaymentSettings,
} from '../types/store';
import { saveStaticSettings } from '../lib/staticFallback';

interface PaymentSettingsPanelProps {
  payment: PaymentSettings;
  status: PaymentGatewayStatus;
  adminToken: string;
  isStaticMode?: boolean;
  serverlessAvailable?: boolean;
  onSaved: () => void;
}

const PROVIDERS: Array<{ id: PaymentGatewayProvider; label: string; desc: string }> = [
  {
    id: 'builtin_auto',
    label: 'QRIS & VA Otomatis Bawaan',
    desc: 'Tampilkan QRIS, nomor VA, dan konfirmasi otomatis langsung di laci checkout.',
  },
  {
    id: 'midtrans',
    label: 'Midtrans Snap (QRIS, VA, E-Wallet)',
    desc: 'Buat tautan pembayaran Midtrans otomatis melalui MIDTRANS_SERVER_KEY di server/Vercel.',
  },
  {
    id: 'tripay',
    label: 'Tripay Payment Gateway',
    desc: 'Siap dihubungkan dengan callback webhook Tripay pada server Node.js/Vercel.',
  },
  {
    id: 'xendit',
    label: 'Xendit Invoice',
    desc: 'Siap dihubungkan dengan webhook invoice Xendit untuk konfirmasi lunas otomatis.',
  },
];

export function PaymentSettingsPanel({
  payment,
  status,
  adminToken,
  isStaticMode = false,
  serverlessAvailable = false,
  onSaved,
}: PaymentSettingsPanelProps) {
  const [draft, setDraft] = useState<PaymentSettings>(payment);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const updateMethod = (id: PaymentMethodConfig['id'], patch: Partial<PaymentMethodConfig>) => {
    setDraft((prev) => ({
      ...prev,
      methods: prev.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const handleSave = async () => {
    setFeedback(null);
    const activeCount = draft.methods.filter((m) => m.enabled).length;
    if (activeCount === 0) {
      setFeedback({ type: 'err', text: 'Minimal satu metode pembayaran harus diaktifkan.' });
      return;
    }

    setSaving(true);
    try {
      if (isStaticMode) {
        saveStaticSettings({ payment: draft });
        setFeedback({
          type: 'ok',
          text: serverlessAvailable
            ? 'Pengaturan pembayaran disimpan dan langsung aktif di halaman checkout.'
            : 'Pengaturan pembayaran disimpan lokal di browser dan langsung aktif di checkout.',
        });
        onSaved();
        return;
      }

      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ payment: draft }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan pembayaran.');
      setFeedback({ type: 'ok', text: 'Pengaturan pembayaran otomatis berhasil disimpan.' });
      onSaved();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan pembayaran.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-zinc-800">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-zinc-50">
            Pengaturan Pembayaran Otomatis
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Atur penyedia payment gateway, metode bayar aktif, nomor QRIS/VA, serta batas waktu pembayaran.
          </p>
        </div>

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

      {isStaticMode && !serverlessAvailable && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Anda sedang membuka versi statis GitHub Pages (tanpa server backend).
            </p>
            <p className="mt-1">
              Semua pengaturan metode bayar, nomor VA, dan QRIS di bawah tetap berfungsi di checkout. Untuk
              pembayaran otomatis nyata (Midtrans Snap + Webhook) secara gratis, hubungkan repositori GitHub
              Anda ke <strong>Vercel</strong>—endpoint <span className="font-mono">/api/payment</span> sudah siap pakai.
            </p>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {feedback.type === 'ok' ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Gateway Provider & Merchant Details */}
        <div className="space-y-5 lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Status Payment Gateway Server
            </h3>
            <div className="mt-3 divide-y divide-slate-200 border-t border-slate-200 text-xs dark:divide-zinc-800 dark:border-zinc-800">
              <div className="flex items-center justify-between py-2.5">
                <span className="font-mono text-slate-700 dark:text-zinc-300">MIDTRANS_SERVER_KEY</span>
                <span
                  className={
                    status.midtransConfigured
                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'font-semibold text-slate-500 dark:text-zinc-400'
                  }
                >
                  {status.midtransConfigured ? `Aktif (${status.mode})` : 'Opsional (Belum dipasang)'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="font-mono text-slate-700 dark:text-zinc-300">PAYMENT_WEBHOOK_SECRET</span>
                <span
                  className={
                    status.webhookSecretConfigured
                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'font-semibold text-slate-500 dark:text-zinc-400'
                  }
                >
                  {status.webhookSecretConfigured ? 'Terpasang' : 'Opsional'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Penyedia &amp; Identitas Merchant
            </h3>

            <div className="space-y-2">
              {PROVIDERS.map((prov) => {
                const selected = draft.provider === prov.id;
                return (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => setDraft({ ...draft, provider: prov.id })}
                    className={`w-full cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? 'border-blue-600 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      {prov.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
                      {prov.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Nama Merchant
                </label>
                <input
                  type="text"
                  value={draft.merchantName}
                  onChange={(e) => setDraft({ ...draft, merchantName: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  NMID QRIS
                </label>
                <input
                  type="text"
                  value={draft.qrisMerchantId}
                  onChange={(e) => setDraft({ ...draft, qrisMerchantId: e.target.value })}
                  placeholder="ID1026xxxxxxxxx"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  URL Gambar QRIS Statis (Opsional)
                </label>
                <input
                  type="url"
                  value={draft.qrisImageUrl}
                  onChange={(e) => setDraft({ ...draft, qrisImageUrl: e.target.value })}
                  placeholder="https://.../qris-toko-anda.png"
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Batas Bayar (Menit)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={draft.expiryMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, expiryMinutes: Number(e.target.value || 30) })
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Payment Methods Toggle & Account Numbers */}
        <div className="space-y-5 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Kanal Pembayaran Aktif
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                  Aktifkan atau nonaktifkan kanal serta sesuaikan nomor rekening / VA penerima.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      methods: prev.methods.map((m) => ({
                        ...m,
                        enabled: m.id === 'telegram_bank',
                      })),
                    }))
                  }
                  style={{ backgroundColor: 'var(--store-accent)' }}
                  className="h-8 cursor-pointer rounded-lg px-3 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap"
                >
                  Konfirmasi Telegram Saja
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      methods: prev.methods.map((m) => ({
                        ...m,
                        enabled: m.id === 'bank_transfer',
                      })),
                    }))
                  }
                  className="h-8 cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                >
                  Rekening Tetap Saja
                </button>
              </div>
            </div>

            <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
              {draft.methods.map((method) => (
                <div key={method.id} className="space-y-3 py-4 first:pt-4 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={method.enabled}
                        onChange={(e) => updateMethod(method.id, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                        {method.label}
                      </span>
                    </label>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                      {method.enabled ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>

                  {method.enabled && method.id === 'telegram_bank' && (
                    <div className="ml-6 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs leading-relaxed text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-zinc-300">
                      <p className="font-semibold text-slate-900 dark:text-zinc-100">
                        Cara membalas pesanan di Telegram:
                      </p>
                      <p className="mt-1">
                        Saat pembeli checkout, bot akan mengirim pesan pesanan ke Telegram Anda. Cukup{' '}
                        <strong>Reply (Balas)</strong> pesan tersebut dengan format:
                      </p>
                      <p className="mt-1.5 rounded border border-blue-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                        BCA | 1234567890 | 129123
                      </p>
                      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                        Data Nama Bank, Nomor Rekening, dan Nominal langsung tampil otomatis di layar pembeli.
                        Setelah pembeli transfer dan Anda cek mutasi, balas <strong>LUNAS</strong> untuk membuka
                        link unduhan produk.
                      </p>
                    </div>
                  )}

                  {method.enabled && method.id !== 'telegram_bank' && (
                    <div className="grid gap-3 pl-6 sm:grid-cols-2">
                      {method.id === 'bank_transfer' && (
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                            Nama Bank (Contoh: Transfer Bank BRI / BCA / SeaBank)
                          </label>
                          <input
                            type="text"
                            value={method.label}
                            onChange={(e) => updateMethod(method.id, { label: e.target.value })}
                            className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                          {method.id === 'bank_transfer'
                            ? 'Nomor Rekening Bank'
                            : 'Nomor VA / Rekening / NMID'}
                        </label>
                        <input
                          type="text"
                          value={method.accountNumber}
                          onChange={(e) =>
                            updateMethod(method.id, { accountNumber: e.target.value })
                          }
                          className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                          Atas Nama Penerima
                        </label>
                        <input
                          type="text"
                          value={method.accountHolder}
                          onChange={(e) =>
                            updateMethod(method.id, { accountHolder: e.target.value })
                          }
                          className="mt-1 h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-xs leading-relaxed text-slate-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
            <p className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
              Syarat Wajib Konfirmasi 2-Arah Telegram di Vercel
            </p>
            <p className="mt-1">
              Pastikan 2 variabel Bot Telegram berikut sudah terpasang di{' '}
              <strong>Vercel → Settings → Environment Variables</strong> (lalu klik <strong>Redeploy</strong>):
            </p>
            <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              <p>TELEGRAM_BOT_TOKEN = Token dari @BotFather</p>
              <p>TELEGRAM_CHAT_ID = ID Telegram Anda (dari @userinfobot)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
