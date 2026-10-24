/**
 * Countdown math for the "Refresh" button in the status bar.
 * Pure functions: pass `now` in, so tests don't depend on the real clock.
 */

/**
 * Whole seconds until the next automatic refresh, or null if no refresh is scheduled yet.
 * Rounds up, so "next in 1 s" shows until the moment it's due (never "0 s" too early),
 * and never goes below 0 (the refresh can run a few seconds late).
 */
export function secondsUntilRefresh(nextRefreshAt: number | null, now: number): number | null {
  if (nextRefreshAt === null || !Number.isFinite(nextRefreshAt)) return null;
  return Math.max(0, Math.ceil((nextRefreshAt - now) / 1000));
}

/**
 * The small muted text next to the button: "next in 42 s".
 * Empty while nothing is scheduled; "updating…" while a refresh is running or due.
 */
export function formatCountdown(seconds: number | null, refreshing: boolean): string {
  if (refreshing) return 'updating…';
  if (seconds === null) return '';
  if (seconds === 0) return 'updating…';
  return `next in ${seconds} s`;
}
