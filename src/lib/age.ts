export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown';

/**
 * Turn an age in milliseconds into friendly text:
 * "just now", "42 sec ago", "7 min ago", "2 hr 5 min ago", "3 days ago".
 */
export function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return 'time unknown';
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} sec ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes % 60;
    return rem === 0 ? `${hours} hr ago` : `${hours} hr ${rem} min ago`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** How long ago `isoTime` was, relative to `now` (milliseconds). NaN if unknown. */
export function ageMs(isoTime: string | null, now: number): number {
  if (!isoTime) return Number.NaN;
  const t = Date.parse(isoTime);
  return Number.isNaN(t) ? Number.NaN : now - t;
}

/**
 * Color-code an image's age so you can tell at a glance whether to trust it.
 * fresh: under 5 min · aging: under 30 min · stale: older.
 */
export function freshness(ageMsValue: number): Freshness {
  if (!Number.isFinite(ageMsValue)) return 'unknown';
  const minutes = ageMsValue / 60_000;
  if (minutes < 5) return 'fresh';
  if (minutes < 30) return 'aging';
  return 'stale';
}
