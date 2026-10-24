import { bearingDeg, distanceMeters } from './geo.js';
import type { LatLon } from './types.js';

/** We only trust a computed heading once you've moved at least this far. */
export const MIN_MOVE_FOR_HEADING_METERS = 25;

export interface Fix extends LatLon {
  /** Heading reported by the device, if any (many browsers report null or NaN). */
  heading: number | null;
  /** Speed in meters/second reported by the device, if any. */
  speed: number | null;
}

/**
 * Work out which way you're travelling.
 *
 * Phones often report a heading directly. When they don't (or when you're
 * barely moving and it's noise), we compare where you are now with an earlier
 * position: the direction from "then" to "now" is your heading.
 *
 * Returns null when we can't tell yet (e.g. you're parked).
 */
export function resolveHeading(current: Fix, anchor: LatLon | null): number | null {
  const deviceHeading = current.heading;
  const movingFastEnough = current.speed !== null && current.speed > 2; // ~4.5 mph
  if (deviceHeading !== null && Number.isFinite(deviceHeading) && movingFastEnough) {
    return deviceHeading;
  }
  if (anchor && distanceMeters(anchor, current) >= MIN_MOVE_FOR_HEADING_METERS) {
    return bearingDeg(anchor, current);
  }
  return null;
}
