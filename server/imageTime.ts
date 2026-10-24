/**
 * How old is a camera image?
 *
 * The camera list tells us *where* the image is, but not exactly *when* it was taken.
 * Web servers usually answer that for free: a HEAD request (fetch the headers, skip the
 * picture) returns a `Last-Modified` header with the time the file last changed.
 */

const CACHE_TTL_MS = 30_000;
const TIMEOUT_MS = 4_000;
const cache = new Map<string, { checkedAt: number; value: string | null }>();

export function clearImageTimeCache(): void {
  cache.clear();
}

export async function fetchImageLastModified(
  url: string,
  fetchFn: typeof fetch,
  now: number,
): Promise<string | null> {
  const hit = cache.get(url);
  if (hit && now - hit.checkedAt < CACHE_TTL_MS) return hit.value;

  let value: string | null = null;
  try {
    const response = await fetchFn(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const header = response.ok ? response.headers.get('last-modified') : null;
    const parsed = header ? Date.parse(header) : Number.NaN;
    value = Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  } catch {
    value = null; // timeouts and network errors just mean "unknown"
  }
  cache.set(url, { checkedAt: now, value });
  return value;
}

/** Run `task` over `items` with at most `limit` running at once (be polite to Caltrans). */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
