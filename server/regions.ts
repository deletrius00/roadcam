/**
 * Which state's data do we need for a search?
 *
 * Each data source covers one state. We only download a state's feeds when the search
 * circle reaches into that state, so a driver in Tacoma never waits on California's 12
 * Caltrans files, and vice versa.
 */
import { METERS_PER_MILE } from '../src/lib/geo.js';
import type { LatLon } from '../src/lib/types.js';

interface Box {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** Rough state outlines (a little generous at the edges). */
export const REGIONS = {
  california: { minLat: 32.4, maxLat: 42.1, minLon: -124.6, maxLon: -114.0 },
  washington: { minLat: 45.5, maxLat: 49.1, minLon: -124.9, maxLon: -116.8 },
} satisfies Record<string, Box>;

export type Region = keyof typeof REGIONS;

/** Regions whose box comes within `radiusMeters` of `center`. */
export function regionsNear(center: LatLon, radiusMeters: number): Region[] {
  const padLat = radiusMeters / 111_000;
  const padLon = radiusMeters / (111_000 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  return (Object.keys(REGIONS) as Region[]).filter((name) => {
    const b = REGIONS[name];
    return (
      center.lat >= b.minLat - padLat &&
      center.lat <= b.maxLat + padLat &&
      center.lon >= b.minLon - padLon &&
      center.lon <= b.maxLon + padLon
    );
  });
}

export const MILES = METERS_PER_MILE;
