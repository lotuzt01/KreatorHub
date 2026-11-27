import { useState } from 'react';
import type { User } from 'firebase/auth';
import { AlertCircle, ArrowLeft, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  signInAdminWithGoogle,
  signOutAdmin,
  verifyAdminAccess,
} from '../lib/firebase';
import { seedInitialStoreDataIfEmpty } from '../lib/firestoreStore';

interface AdminAuthGateProps {
  storeName: string;
  authReady: boolean;
  onAuthenticated: (user: User) => void;
  onBackToStore: () => void;
}

export function AdminAuthGate({
  storeName,
  authReady,
  onAuthenticated,
  onBackToStore,
}: AdminAuthGateProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      const user = await signInAdminWithGoogle();
      const allowed = await verifyAdminAccess(user);
      if (!allowed) {
        const attemptedEmail = user.email || 'akun ini';
        await signOutAdmin().catch(() => {});
        setError(
          `Akses ditolak untuk ${attemptedEmail}. Silakan masuk menggunakan akun Google admin terdaftar (${BOOTSTRAPPED_ADMIN_EMAIL}).`,
        );
        return;
      }

      await seedInitialStoreDataIfEmpty(user);
      onAuthenticated(user);
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('popup-closed-by-user')) {
        setError('Jendela login Google ditutup sebelum selesai. Silakan coba lagi.');
      } else if (raw.includes('unauthorized-domain')) {
        setError(
          'Domain ini belum ditambahkan di Firebase Console → Authentication → Settings → Authorized domains. Tambahkan domain Vercel Anda di sana agar login Google berjalan.',
        );
      } else {
        setError(raw || 'Gagal masuk dengan akun Google.');
      }
    } finally {
      setSigningIn(false);
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
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-zinc-50">
              Masuk ke Dasbor Admin
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Autentikasi Google aman dengan sinkronisasi database cloud real-time.
            </p>
          </div>
        </div>

        {!authReady ? (
          <div className="mt-6 flex items-center justify-center gap-2 py-6 text-xs text-slate-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Memeriksa sesi admin...</span>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p>
                Masuk dengan akun Google pemilik toko untuk mengelola katalog produk, pengaturan
                rekening bank, verifikasi pesanan, dan tema secara langsung di semua perangkat.
              </p>
            </div>

            <button
              type="button"
              disabled={signingIn}
              onClick={handleGoogleSignIn}
              style={{ backgroundColor: 'var(--store-accent)' }}
              className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {signingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Memverifikasi Akun Google...</span>
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  <span>Masuk dengan Google</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
