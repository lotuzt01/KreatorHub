import { useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

interface AdminAuthGateProps {
  storeName: string;
  onAuthenticated: (token: string) => void;
  onBackToStore: () => void;
}

export function AdminAuthGate({
  storeName,
  onAuthenticated,
  onBackToStore,
}: AdminAuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [mode, setMode] = useState<'env' | 'claimed' | 'setup_required'>('claimed');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/auth/status')
      .then((res) => res.json())
      .then((data: { mode?: 'env' | 'claimed' | 'setup_required'; setupRequired?: boolean }) => {
        if (!active) return;
        setMode(data.mode || 'claimed');
        setSetupRequired(Boolean(data.setupRequired));
      })
      .catch(() => {
        if (!active) return;
        setError('Gagal memeriksa status autentikasi server.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (setupRequired) {
      if (password.length < 8) {
        setError('Kata sandi admin minimal 8 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    } else if (!password) {
      setError('Masukkan kata sandi admin.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = setupRequired ? '/api/admin/auth/setup' : '/api/admin/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Autentikasi gagal.');
      }
      onAuthenticated(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autentikasi gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={onBackToStore}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Kembali ke {storeName}</span>
        </button>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
            {setupRequired ? <ShieldCheck className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
              {setupRequired ? 'Aktifkan Akses Admin' : 'Masuk ke Dasbor Admin'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {setupRequired
                ? 'Buat kata sandi admin pertama untuk mengamankan toko Anda.'
                : mode === 'env'
                  ? 'Gunakan ADMIN_PASSCODE yang terdaftar di Secrets.'
                  : 'Masukkan kata sandi admin yang telah Anda atur.'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
              >
                {setupRequired ? 'Kata Sandi Admin Baru (min. 8 karakter)' : 'Kata Sandi Admin'}
              </label>
              <input
                id="admin-password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            {setupRequired && (
              <div>
                <label
                  htmlFor="admin-password-confirm"
                  className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                >
                  Konfirmasi Kata Sandi
                </label>
                <input
                  id="admin-password-confirm"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: 'var(--store-accent)' }}
              className="h-10 w-full cursor-pointer rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting
                ? 'Memverifikasi...'
                : setupRequired
                  ? 'Simpan Kata Sandi & Buka Dasbor'
                  : 'Masuk ke Dasbor'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
