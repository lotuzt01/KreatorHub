import { useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Save } from 'lucide-react';
import type {
  PaymentGatewayProvider,
  PaymentGatewayStatus,
  PaymentMethodConfig,
  PaymentSettings,
} from '../types/store';
import { isSafeHttpOrLocalUrl } from '../lib/format';
import { saveStaticSettings } from '../lib/staticFallback';

interface PaymentSettingsPanelProps {
  payment: PaymentSettings;
  status: PaymentGatewayStatus;
  adminToken: string;
  isStaticMode?: boolean;
  serverlessAvailable?: boolean;
  onSaved: () => void;
}

interface PaymentValidationErrors {
  merchantName?: string;
  expiryMinutes?: string;
  qrisImageUrl?: string;
  methodsGlobal?: string;
  methods: Record<
    string,
    {
      label?: string;
      accountNumber?: string;
      accountHolder?: string;
    }
  >;
}

const PROVIDERS: Array<{ id: PaymentGatewayProvider; label: string; desc: string }> = [
  {
    id: 'builtin_auto',
    label: 'Konfirmasi Telegram & Rekening Bawaan',
    desc: 'Kirim rekening langsung via Telegram Admin atau tampilkan nomor rekening/QRIS di checkout.',
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

function validatePaymentDraft(draft: PaymentSettings): {
  valid: boolean;
  errors: PaymentValidationErrors;
  summary: string[];
} {
  const errors: PaymentValidationErrors = { methods: {} };
  const summary: string[] = [];

  const merchantName = draft.merchantName.trim();
  if (merchantName.length < 2) {
    errors.merchantName = 'Nama merchant wajib diisi minimal 2 karakter.';
    summary.push(errors.merchantName);
  }

  if (
    !Number.isFinite(draft.expiryMinutes) ||
    draft.expiryMinutes < 5 ||
    draft.expiryMinutes > 1440
  ) {
    errors.expiryMinutes = 'Batas waktu pembayaran harus antara 5 hingga 1440 menit.';
    summary.push(errors.expiryMinutes);
  }

  const qrisImg = draft.qrisImageUrl.trim();
  if (qrisImg && !isSafeHttpOrLocalUrl(qrisImg)) {
    errors.qrisImageUrl = 'URL gambar QRIS harus diawali https://, http://, atau path lokal /...';
    summary.push(errors.qrisImageUrl);
  }

  const enabledMethods = draft.methods.filter((m) => m.enabled);
  if (enabledMethods.length === 0) {
    errors.methodsGlobal = 'Minimal satu metode pembayaran harus diaktifkan.';
    summary.push(errors.methodsGlobal);
  }

  for (const method of enabledMethods) {
    if (method.id === 'telegram_bank') continue;

    const mErr: { label?: string; accountNumber?: string; accountHolder?: string } = {};
    const label = method.label.trim();
    const rawNumber = method.accountNumber.trim();
    const digitsOnly = rawNumber.replace(/[\s-]/g, '');
    const holder = method.accountHolder.trim();

    if (method.id === 'bank_transfer') {
      if (label.length < 3 || !/[a-zA-Z]{2,}/.test(label)) {
        mErr.label = 'Nama bank wajib diisi dengan benar (min. 3 karakter huruf, mis. Bank BCA / BRI / SeaBank).';
      }
      if (!rawNumber) {
        mErr.accountNumber = 'Nomor rekening bank wajib diisi.';
      } else if (/[^\d\s-]/.test(rawNumber)) {
        mErr.accountNumber = 'Nomor rekening hanya boleh berisi angka (boleh spasi atau tanda strip).';
      } else if (!/^\d{6,25}$/.test(digitsOnly)) {
        mErr.accountNumber = 'Nomor rekening harus terdiri dari 6 hingga 25 digit angka.';
      } else if (digitsOnly === '1234567890') {
        mErr.accountNumber = 'Ganti nomor contoh 1234567890 dengan nomor rekening asli Anda.';
      }

      if (holder.length < 3 || /^nama pemilik rekening$/i.test(holder)) {
        mErr.accountHolder = 'Isi nama asli pemilik rekening sesuai buku tabungan (min. 3 karakter).';
      }
    } else if (method.id === 'qris') {
      if (!/^[a-zA-Z0-9._-]{6,60}$/.test(rawNumber.replace(/\s+/g, ''))) {
        mErr.accountNumber = 'NMID / ID Merchant QRIS minimal 6 karakter alfanumerik tanpa simbol aneh.';
      }
      if (holder.length < 2) {
        mErr.accountHolder = 'Atas nama penerima QRIS wajib diisi minimal 2 karakter.';
      }
    } else {
      if (!rawNumber) {
        mErr.accountNumber = `Nomor tujuan untuk ${label || method.id} wajib diisi.`;
      } else if (/[^\d\s-]/.test(rawNumber)) {
        mErr.accountNumber = 'Nomor VA / E-Wallet hanya boleh berisi angka.';
      } else if (!/^\d{8,25}$/.test(digitsOnly)) {
        mErr.accountNumber = 'Nomor VA / E-Wallet harus terdiri dari 8 hingga 25 digit angka.';
      }
      if (holder.length < 2) {
        mErr.accountHolder = 'Atas nama penerima wajib diisi minimal 2 karakter.';
      }
    }

    if (mErr.label || mErr.accountNumber || mErr.accountHolder) {
      errors.methods[method.id] = mErr;
      if (mErr.label) summary.push(`${method.label || 'Rekening Bank'}: ${mErr.label}`);
      if (mErr.accountNumber) summary.push(`${method.label || method.id}: ${mErr.accountNumber}`);
      if (mErr.accountHolder) summary.push(`${method.label || method.id}: ${mErr.accountHolder}`);
    }
  }

  return { valid: summary.length === 0, errors, summary };
}

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
  const [touched, setTouched] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const validation = useMemo(() => validatePaymentDraft(draft), [draft]);

  const updateMethod = (id: PaymentMethodConfig['id'], patch: Partial<PaymentMethodConfig>) => {
    setFeedback(null);
    setDraft((prev) => ({
      ...prev,
      methods: prev.methods.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  };

  const handleSave = async () => {
    setTouched(true);
    setFeedback(null);

    const check = validatePaymentDraft(draft);
    if (!check.valid) {
      setFeedback({
        type: 'err',
        text: `Periksa kembali format input sebelum menyimpan: ${check.summary[0]}`,
      });
      return;
    }

    // Normalize whitespace in bank & account fields cleanly before saving
    const normalizedDraft: PaymentSettings = {
      ...draft,
      merchantName: draft.merchantName.trim(),
      qrisMerchantId: draft.qrisMerchantId.trim(),
      qrisImageUrl: draft.qrisImageUrl.trim(),
      methods: draft.methods.map((m) => ({
        ...m,
        label: m.label.trim(),
        accountNumber:
          m.id === 'telegram_bank' || m.id === 'qris'
            ? m.accountNumber.trim()
            : m.accountNumber.replace(/[\s-]+/g, ''),
        accountHolder: m.accountHolder.trim(),
      })),
    };

    setSaving(true);
    try {
      if (isStaticMode) {
        saveStaticSettings({ payment: normalizedDraft });
        setDraft(normalizedDraft);
        setFeedback({
          type: 'ok',
          text: serverlessAvailable
            ? 'Pengaturan pembayaran valid, disimpan, dan langsung aktif di halaman checkout.'
            : 'Pengaturan pembayaran valid dan disimpan lokal di browser.',
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
        body: JSON.stringify({ payment: normalizedDraft }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan pembayaran.');
      setDraft(normalizedDraft);
      setFeedback({ type: 'ok', text: 'Pengaturan pembayaran berhasil divalidasi dan disimpan.' });
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
            Pengaturan Pembayaran
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            Atur kanal pembayaran, validasi format nama bank &amp; nomor rekening, serta batas waktu pesanan.
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
              Semua pengaturan metode bayar tetap berfungsi di browser ini. Untuk konfirmasi Telegram 2-arah
              dan pembayaran otomatis nyata gratis, gunakan deployment <strong>Vercel</strong> Anda.
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
          <div>
            <p>{feedback.text}</p>
            {feedback.type === 'err' && validation.summary.length > 1 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 font-normal">
                {validation.summary.slice(1).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
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

            <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Nama Merchant / Pemilik Toko
                </label>
                <input
                  type="text"
                  value={draft.merchantName}
                  onChange={(e) => setDraft({ ...draft, merchantName: e.target.value })}
                  className={`mt-1 h-9 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 ${
                    touched && validation.errors.merchantName
                      ? 'border-red-500 focus:outline-none'
                      : 'border-slate-300 dark:border-zinc-700'
                  }`}
                />
                {touched && validation.errors.merchantName && (
                  <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                    {validation.errors.merchantName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  ID Merchant QRIS (NMID — Opsional)
                </label>
                <input
                  type="text"
                  value={draft.qrisMerchantId}
                  onChange={(e) => setDraft({ ...draft, qrisMerchantId: e.target.value })}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  URL Gambar QRIS Statis (Opsional)
                </label>
                <input
                  type="text"
                  value={draft.qrisImageUrl}
                  onChange={(e) => setDraft({ ...draft, qrisImageUrl: e.target.value })}
                  placeholder="https://.../qris-toko-anda.png"
                  className={`mt-1 h-9 w-full rounded-lg border bg-white px-3 font-mono text-xs text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 ${
                    touched && validation.errors.qrisImageUrl
                      ? 'border-red-500 focus:outline-none'
                      : 'border-slate-300 dark:border-zinc-700'
                  }`}
                />
                {touched && validation.errors.qrisImageUrl && (
                  <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                    {validation.errors.qrisImageUrl}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400">
                  Batas Waktu Pembayaran (menit)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={draft.expiryMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, expiryMinutes: Number(e.target.value || 0) })
                  }
                  className={`mt-1 h-9 w-full rounded-lg border bg-white px-3 font-mono text-sm tabular-nums text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 ${
                    touched && validation.errors.expiryMinutes
                      ? 'border-red-500 focus:outline-none'
                      : 'border-slate-300 dark:border-zinc-700'
                  }`}
                />
                {touched && validation.errors.expiryMinutes && (
                  <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                    {validation.errors.expiryMinutes}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Payment Methods Toggle & Validated Account Numbers */}
        <div className="space-y-5 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-zinc-100">
                  Kanal Pembayaran Aktif
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                  Format nama bank, nomor rekening (6–25 digit angka), dan atas nama divalidasi sebelum disimpan.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setDraft((prev) => ({
                      ...prev,
                      methods: prev.methods.map((m) => ({
                        ...m,
                        enabled: m.id === 'telegram_bank',
                      })),
                    }));
                  }}
                  style={{ backgroundColor: 'var(--store-accent)' }}
                  className="h-8 cursor-pointer rounded-lg px-3 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap"
                >
                  Konfirmasi Telegram Saja
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setDraft((prev) => ({
                      ...prev,
                      methods: prev.methods.map((m) => ({
                        ...m,
                        enabled: m.id === 'bank_transfer',
                      })),
                    }));
                  }}
                  className="h-8 cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                >
                  Rekening Tetap Saja
                </button>
              </div>
            </div>

            {touched && validation.errors.methodsGlobal && (
              <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                {validation.errors.methodsGlobal}
              </p>
            )}

            <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200 dark:divide-zinc-800 dark:border-zinc-800">
              {draft.methods.map((method) => {
                const mErr = validation.errors.methods[method.id];
                const hasError = Boolean(touched && mErr);
                const isBankValid =
                  method.enabled && method.id !== 'telegram_bank' && !mErr;

                return (
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
                      <div className="flex items-center gap-2">
                        {isBankValid && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Format Valid</span>
                          </span>
                        )}
                        {hasError && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Perlu Diperbaiki</span>
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                          {method.enabled ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </div>

                    {method.enabled && method.id === 'telegram_bank' && (
                      <div className="ml-6 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs leading-relaxed text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-zinc-300">
                        <p className="font-semibold text-slate-900 dark:text-zinc-100">
                          Cara membalas pesanan di Telegram:
                        </p>
                        <p className="mt-1">
                          Saat pembeli checkout, bot mengirim pesan pesanan ke Telegram Anda. Cukup{' '}
                          <strong>Reply (Balas)</strong> pesan tersebut dengan format:
                        </p>
                        <p className="mt-1.5 rounded border border-blue-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
                          BCA | 1234567890 | 129123
                        </p>
                        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
                          Setelah pembeli transfer, Anda bisa memverifikasi lewat balas{' '}
                          <strong>LUNAS</strong> di Telegram atau langsung dari menu{' '}
                          <strong>Pesanan → Verifikasi &amp; Kirim Link</strong> di dasbor ini.
                        </p>
                      </div>
                    )}

                    {method.enabled && method.id !== 'telegram_bank' && (
                      <div className="grid gap-3 pl-6 sm:grid-cols-2">
                        {method.id === 'bank_transfer' && (
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                              Nama Bank <span className="text-red-500">*</span> (Contoh: Bank BCA / Bank BRI / SeaBank)
                            </label>
                            <input
                              type="text"
                              value={method.label}
                              onChange={(e) => updateMethod(method.id, { label: e.target.value })}
                              placeholder="Contoh: Bank BCA"
                              className={`mt-1 h-8 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 ${
                                touched && mErr?.label
                                  ? 'border-red-500 focus:outline-none'
                                  : 'border-slate-300 dark:border-zinc-700'
                              }`}
                            />
                            {touched && mErr?.label && (
                              <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                                {mErr.label}
                              </p>
                            )}
                          </div>
                        )}
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                            {method.id === 'bank_transfer'
                              ? 'Nomor Rekening Bank (6–25 digit angka)'
                              : method.id === 'qris'
                                ? 'NMID / ID Merchant QRIS'
                                : 'Nomor VA / E-Wallet (8–25 digit angka)'}{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            inputMode={method.id === 'qris' ? 'text' : 'numeric'}
                            value={method.accountNumber}
                            onChange={(e) =>
                              updateMethod(method.id, { accountNumber: e.target.value })
                            }
                            placeholder={method.id === 'bank_transfer' ? 'Contoh: 7310294812' : ''}
                            className={`mt-1 h-8 w-full rounded-lg border bg-white px-2.5 font-mono text-xs text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 ${
                              touched && mErr?.accountNumber
                                ? 'border-red-500 focus:outline-none'
                                : 'border-slate-300 dark:border-zinc-700'
                            }`}
                          />
                          {touched && mErr?.accountNumber && (
                            <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                              {mErr.accountNumber}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                            Atas Nama Penerima <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={method.accountHolder}
                            onChange={(e) =>
                              updateMethod(method.id, { accountHolder: e.target.value })
                            }
                            placeholder="Sesuai buku tabungan"
                            className={`mt-1 h-8 w-full rounded-lg border bg-white px-2.5 text-xs text-slate-900 dark:bg-zinc-950 dark:text-zinc-100 ${
                              touched && mErr?.accountHolder
                                ? 'border-red-500 focus:outline-none'
                                : 'border-slate-300 dark:border-zinc-700'
                            }`}
                          />
                          {touched && mErr?.accountHolder && (
                            <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                              {mErr.accountHolder}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
