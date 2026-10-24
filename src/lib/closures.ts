/**
 * Closures and roadwork: splitting into "Now" and "Upcoming" and saying when, in plain English.
 * Pure functions: pass `now` (and a time zone in tests) so results don't depend on the real clock.
 */
import type { Closure } from './types.js';

/** "Mon 8:01 PM", in the given time zone (the browser's own when not given). */
export function shortWhen(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/**
 * When a closure happens, as a short phrase:
 *   active   → "Now, until Sun 5:59 AM" (or just "Now")
 *   upcoming → "Starts in 3 h (Sat 4:00 PM)" when it's today-ish, else "Starts Mon 8:01 PM"
 *   no time  → "Scheduled: see details" (WSDOT describes its schedule in words)
 */
export function closureWhen(c: Pick<Closure, 'status' | 'startsAt' | 'endsAt'>, now: number, timeZone?: string): string {
  if (c.status === 'active') return c.endsAt ? `Now, until ${shortWhen(c.endsAt, timeZone)}` : 'Now';
  if (!c.startsAt) return 'Scheduled: see details';
  const ms = Date.parse(c.startsAt) - now;
  if (ms <= 0) return `Due to start (${shortWhen(c.startsAt, timeZone)})`;
  const hours = ms / 3_600_000;
  if (hours < 1) return `Starts in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 12) return `Starts in ${Math.round(hours)} h (${shortWhen(c.startsAt, timeZone)})`;
  return `Starts ${shortWhen(c.startsAt, timeZone)}`;
}

export interface SplitClosures {
  /** Happening now, closest first. */
  now: Closure[];
  /** Coming up, soonest first (ones without a time go last). */
  upcoming: Closure[];
}

/** Split closures into Now and Upcoming. Highway closures come before ramp closures within each. */
export function splitClosures(closures: readonly Closure[]): SplitClosures {
  const rampLast = (c: Closure) => (c.facility === 'Highway' ? 0 : 1);
  const now = closures.filter((c) => c.status === 'active').sort((a, b) => rampLast(a) - rampLast(b) || a.distanceMeters - b.distanceMeters);
  const startOf = (c: Closure) => (c.startsAt ? Date.parse(c.startsAt) : Number.POSITIVE_INFINITY);
  const upcoming = closures
    .filter((c) => c.status === 'upcoming')
    .sort((a, b) => startOf(a) - startOf(b) || rampLast(a) - rampLast(b) || a.distanceMeters - b.distanceMeters);
  return { now, upcoming };
}
