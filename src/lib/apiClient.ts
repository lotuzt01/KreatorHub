export interface WarmupFetchResult<T> {
  res: Response;
  data: T | null;
  contentType: string;
  htmlTitle: string;
}

function isWarmupHtml(contentType: string, htmlTitle: string, rawText: string): boolean {
  if (!contentType.includes('text/html')) return false;
  const combined = `${htmlTitle} ${rawText.slice(0, 600)}`.toLowerCase();
  return (
    combined.includes('starting server') ||
    combined.includes('warmup_start_time') ||
    combined.includes('warming up')
  );
}

async function waitForApiServerReady(
  maxWaitMs = 20000,
  onStatus?: (msg: string) => void,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    onStatus?.('Menghidupkan server otomatis, mohon tunggu sebentar...');
    await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1500 : 2000));
    try {
      const healthRes = await fetch('/api/health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const ct = healthRes.headers.get('content-type') || '';
      if (healthRes.ok && ct.includes('application/json')) {
        return true;
      }
    } catch {
      // Server still booting; continue polling until deadline
    }
  }

  return false;
}

export async function fetchJsonWithWarmupRetry<T>(
  url: string,
  init: RequestInit,
  options?: { maxAttempts?: number; onWarmup?: (msg: string) => void },
): Promise<WarmupFetchResult<T>> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  let lastResult: WarmupFetchResult<T> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await res.json().catch(() => null)) as T | null;
      return { res, data, contentType, htmlTitle: '' };
    }

    const rawText = await res.text().catch(() => '');
    const titleMatch = rawText.match(/<title[^>]*>([^<]{1,80})<\/title>/i);
    const htmlTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
    lastResult = { res, data: null, contentType, htmlTitle };

    if (attempt < maxAttempts - 1 && isWarmupHtml(contentType, htmlTitle, rawText)) {
      const ready = await waitForApiServerReady(20000, options?.onWarmup);
      if (ready) {
        continue;
      }
    }
    break;
  }

  return lastResult!;
}
