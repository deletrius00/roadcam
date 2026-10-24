/**
 * How old is a camera image, and is the camera actually working?
 *
 * We download just the first few KB of each image (an HTTP "Range" request):
 * - the `Last-Modified` header says when the file last changed;
 * - the first bytes are enough to spot a "Temporarily Unavailable" card (see placeholder.ts).
 */
import { isPlaceholderImage, PLACEHOLDER_PROBE_BYTES } from './placeholder.js';

const CACHE_TTL_MS = 30_000;
const TIMEOUT_MS = 4_000;

export interface ImageInfo {
  /** When the image file last changed (ISO 8601), or null if unknown. */
  lastModified: string | null;
  /** True when Caltrans is serving a "Temporarily Unavailable" / "Down" card instead of a picture. */
  unavailable: boolean;
}

const cache = new Map<string, { checkedAt: number; value: ImageInfo }>();

export function clearImageTimeCache(): void {
  cache.clear();
}

export async function fetchImageInfo(url: string, fetchFn: typeof fetch, now: number): Promise<ImageInfo> {
  const hit = cache.get(url);
  if (hit && now - hit.checkedAt < CACHE_TTL_MS) return hit.value;

  let value: ImageInfo = { lastModified: null, unavailable: false };
  try {
    const response = await fetchFn(url, {
      headers: { Range: `bytes=0-${PLACEHOLDER_PROBE_BYTES - 1}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      const header = response.headers.get('last-modified');
      const parsed = header ? Date.parse(header) : Number.NaN;
      const bytes = new Uint8Array(await response.arrayBuffer());
      value = {
        lastModified: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
        unavailable: isPlaceholderImage(bytes),
      };
    }
  } catch {
    // timeouts and network errors just mean "unknown"
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
