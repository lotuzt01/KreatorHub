import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { useResolvedAssetSrc } from '../lib/mediaAssets';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function SafeImage({ src, alt, className = '', fallbackLabel }: SafeImageProps) {
  const { resolvedSrc, loading } = useResolvedAssetSrc(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (loading && !resolvedSrc) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`animate-pulse bg-slate-200/70 dark:bg-zinc-800/80 ${className}`}
      />
    );
  }

  if (!resolvedSrc || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200/70 to-slate-100 text-slate-500 dark:from-zinc-900 dark:via-zinc-800/80 dark:to-zinc-900 dark:text-zinc-400 ${className}`}
      >
        <Package className="h-8 w-8 opacity-60" aria-hidden="true" />
        <span className="mt-2 max-w-[80%] truncate text-xs font-medium">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
