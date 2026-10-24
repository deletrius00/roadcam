/**
 * Settings we remember between visits, kept in the browser's localStorage.
 *
 * Right now that's only the search radius. If you pick 50 mi, the app should still be on
 * 50 mi next time you open it.
 *
 * localStorage can throw in some private-browsing modes (even just touching
 * `window.localStorage`), so every read and write here is wrapped in try/catch.
 * If storage doesn't work, the app simply forgets: it never crashes.
 */

/** The radius choices (miles) shown in the status bar. */
export const RADIUS_OPTIONS: readonly number[] = [10, 25, 50];

/** Used on first visit, or when the saved value is missing or not one of the options. */
export const DEFAULT_RADIUS_MILES = 25;

/** The localStorage key the radius is saved under. */
export const RADIUS_KEY = 'roadcam.radiusMiles';

/** The two localStorage methods we use. Tests pass in a small fake instead of the real thing. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): SettingsStorage {
  return window.localStorage;
}

/**
 * Turn whatever was saved (or nothing) into a radius we can use.
 * Only an exact match for one of `RADIUS_OPTIONS` counts; anything else gives the default.
 *
 * Examples: '50' -> 50, null -> 25, 'banana' -> 25, '30' -> 25.
 */
export function parseRadiusMiles(saved: string | null): number {
  if (saved === null) return DEFAULT_RADIUS_MILES;
  const miles = Number(saved);
  return RADIUS_OPTIONS.includes(miles) ? miles : DEFAULT_RADIUS_MILES;
}

/** Read the saved radius. Falls back to the default if storage is missing, broken or holds junk. */
export function loadRadiusMiles(getStorage: () => SettingsStorage = browserStorage): number {
  try {
    return parseRadiusMiles(getStorage().getItem(RADIUS_KEY));
  } catch {
    return DEFAULT_RADIUS_MILES; // storage threw (private browsing); just use the default
  }
}

/** Save the radius for next visit. If storage throws, we quietly skip saving. */
export function saveRadiusMiles(miles: number, getStorage: () => SettingsStorage = browserStorage): void {
  try {
    getStorage().setItem(RADIUS_KEY, String(miles));
  } catch {
    // ignore: the new radius still works for this visit, it just won't be remembered
  }
}
