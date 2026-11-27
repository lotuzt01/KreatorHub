import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { MediaAsset } from '../types/store';
import { db } from './firebase';
import { resolveAssetUrl } from './format';

export const ASSET_URI_PREFIX = 'asset://';
export const MAX_MEDIA_DATA_URL_LENGTH = 260_000; // Strictly under 280,000 firestore.rules cap

const assetCache = new Map<string, string | null>();
const cacheListeners = new Map<string, Set<() => void>>();

function notifyAssetListeners(assetId: string) {
  const listeners = cacheListeners.get(assetId);
  if (!listeners) return;
  listeners.forEach((fn) => fn());
}

export function isAssetUri(value: string): boolean {
  return value.trim().startsWith(ASSET_URI_PREFIX);
}

export function parseAssetUri(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith(ASSET_URI_PREFIX)) return null;
  const id = trimmed.slice(ASSET_URI_PREFIX.length).trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : null;
}

export function toAssetUri(assetId: string): string {
  return `${ASSET_URI_PREFIX}${assetId}`;
}

export function primeMediaAssetCache(assets: MediaAsset[]): void {
  const presentIds = new Set<string>();
  for (const asset of assets) {
    presentIds.add(asset.id);
    const prev = assetCache.get(asset.id);
    if (prev !== asset.url) {
      assetCache.set(asset.id, asset.url);
      notifyAssetListeners(asset.id);
    }
  }
  // Evict removed items that were previously cached
  for (const [id, val] of assetCache.entries()) {
    if (!presentIds.has(id) && val !== null) {
      assetCache.set(id, null);
      notifyAssetListeners(id);
    }
  }
}

export function setMediaAssetCacheEntry(assetId: string, url: string): void {
  assetCache.set(assetId, url);
  notifyAssetListeners(assetId);
}

export function evictMediaAssetCache(assetId: string): void {
  assetCache.set(assetId, null);
  notifyAssetListeners(assetId);
}

export function formatFileSizeKB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Link Eksternal';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function isSafeExternalImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length < 8 || trimmed.length > 500) return false;
  if (!trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface CompressedImageResult {
  dataUrl: string;
  mimeType: 'image/jpeg' | 'image/webp' | 'image/png';
  width: number;
  height: number;
  sizeBytes: number;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('File tidak dapat dibaca sebagai gambar. Gunakan format JPG, PNG, atau WebP.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Compresses and resizes a user-selected image file directly in the browser
 * so it stays fast, crisp, and safely within Firestore document boundaries (<= 260 KB).
 */
export async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 960,
): Promise<CompressedImageResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pilih file gambar yang valid (JPG, PNG, atau WebP).');
  }
  if (file.type === 'image/svg+xml') {
    throw new Error('Format SVG tidak diizinkan demi keamanan. Gunakan JPG, PNG, atau WebP.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Ukuran file terlalu besar (maksimal 12 MB sebelum kompresi).');
  }

  const img = await loadImageFromFile(file);
  const naturalW = img.naturalWidth || img.width || 800;
  const naturalH = img.naturalHeight || img.height || 600;

  const dimensionSteps = [maxDimension, 800, 640, 520];
  const qualitySteps = [0.82, 0.72, 0.62, 0.52, 0.42];

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser tidak mendukung kompresi gambar kanvas.');
  }

  for (const dim of dimensionSteps) {
    const scale = Math.min(1, dim / Math.max(naturalW, naturalH));
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    canvas.width = targetW;
    canvas.height = targetH;
    // Fill clean white backdrop for transparent PNGs converted to JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const quality of qualitySteps) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_MEDIA_DATA_URL_LENGTH) {
        return {
          dataUrl,
          mimeType: 'image/jpeg',
          width: targetW,
          height: targetH,
          sizeBytes: dataUrl.length,
        };
      }
    }
  }

  throw new Error(
    'Gambar masih terlalu kompleks setelah kompresi. Coba pilih gambar beresolusi lebih kecil.',
  );
}

/**
 * Resolves any storefront image source (`asset://<id>`, `https://...`, or `/src/assets/...`)
 * reactively in real time across public storefront and admin dashboard.
 */
export function useResolvedAssetSrc(src: string): {
  resolvedSrc: string;
  loading: boolean;
} {
  const assetId = parseAssetUri(src);
  const directUrl = assetId ? '' : resolveAssetUrl(src);

  const [resolvedAssetUrl, setResolvedAssetUrl] = useState<string>(() => {
    if (!assetId) return '';
    return assetCache.get(assetId) ?? '';
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (!assetId) return false;
    return !assetCache.has(assetId);
  });

  useEffect(() => {
    if (!assetId) {
      setResolvedAssetUrl('');
      setLoading(false);
      return;
    }

    const syncFromCache = () => {
      if (assetCache.has(assetId)) {
        setResolvedAssetUrl(assetCache.get(assetId) ?? '');
        setLoading(false);
      }
    };

    syncFromCache();

    let listeners = cacheListeners.get(assetId);
    if (!listeners) {
      listeners = new Set();
      cacheListeners.set(assetId, listeners);
    }
    listeners.add(syncFromCache);

    const unsubFirestore = onSnapshot(
      doc(db, 'mediaAssets', assetId),
      (snap) => {
        if (!snap.exists()) {
          assetCache.set(assetId, null);
          setResolvedAssetUrl('');
          setLoading(false);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const nextUrl = typeof data.url === 'string' ? data.url : '';
        assetCache.set(assetId, nextUrl || null);
        setResolvedAssetUrl(nextUrl);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => {
      unsubFirestore();
      listeners?.delete(syncFromCache);
    };
  }, [assetId]);

  return {
    resolvedSrc: assetId ? resolvedAssetUrl : directUrl,
    loading,
  };
}
