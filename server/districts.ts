/**
 * Which Caltrans districts does a search need?
 *
 * Caltrans publishes one camera feed per district, 12 in total. A search only ever
 * reaches 1–3 of them, so we only download those. That is kinder to Caltrans and
 * makes a cold start faster.
 *
 * The boxes below are rough outlines of each district, taken from the published
 * Caltrans district map (which counties belong to which district). They could not be
 * derived from the live feeds when this was written, so each box is padded by 0.25°
 * on every side to be safe: a camera just over a district line is still found.
 */
import { CALTRANS_DISTRICTS } from './caltrans.js';
import { distanceMeters } from '../src/lib/geo.js';
import type { LatLon } from '../src/lib/types.js';

interface Box {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export type CaltransDistrict = (typeof CALTRANS_DISTRICTS)[number];

/** Extra margin added to every side of every box, in degrees. */
export const DISTRICT_PADDING_DEG = 0.25;

/** Approximate outline of each district's counties, before padding. */
const RAW_DISTRICT_BOXES: Record<CaltransDistrict, Box> = {
  // Del Norte, Humboldt, Mendocino, Lake
  1: { minLat: 38.67, maxLat: 42.0, minLon: -124.41, maxLon: -122.34 },
  // Siskiyou, Modoc, Trinity, Shasta, Lassen, Tehama, Plumas
  2: { minLat: 39.6, maxLat: 42.0, minLon: -123.72, maxLon: -120.0 },
  // Sacramento, Placer, El Dorado, Nevada, Sierra, Yuba, Sutter, Yolo, Colusa, Glenn, Butte
  3: { minLat: 38.02, maxLat: 40.15, minLon: -122.94, maxLon: -119.88 },
  // Bay Area: Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma
  4: { minLat: 36.89, maxLat: 38.86, minLon: -123.53, maxLon: -121.2 },
  // Central Coast: Santa Cruz, San Benito, Monterey, San Luis Obispo, Santa Barbara
  5: { minLat: 34.4, maxLat: 37.29, minLon: -122.32, maxLon: -119.44 },
  // Fresno, Kern, Kings, Madera, Tulare
  6: { minLat: 34.79, maxLat: 37.78, minLon: -120.92, maxLon: -117.62 },
  // Los Angeles, Ventura
  7: { minLat: 33.7, maxLat: 34.9, minLon: -119.48, maxLon: -117.65 },
  // San Bernardino, Riverside
  8: { minLat: 33.43, maxLat: 35.81, minLon: -117.8, maxLon: -114.13 },
  // Inyo, Mono
  9: { minLat: 35.79, maxLat: 38.71, minLon: -119.65, maxLon: -115.65 },
  // Stockton/Modesto: San Joaquin, Stanislaus, Merced, Mariposa, Tuolumne, Calaveras, Amador, Alpine
  10: { minLat: 36.74, maxLat: 38.93, minLon: -121.58, maxLon: -119.2 },
  // San Diego, Imperial
  11: { minLat: 32.53, maxLat: 33.51, minLon: -117.6, maxLon: -114.46 },
  // Orange
  12: { minLat: 33.38, maxLat: 33.95, minLon: -118.12, maxLon: -117.41 },
};

/** Each district's box with the safety padding added. */
export const DISTRICT_BOXES: Record<CaltransDistrict, Box> = Object.fromEntries(
  CALTRANS_DISTRICTS.map((d) => {
    const b = RAW_DISTRICT_BOXES[d];
    return [
      d,
      {
        minLat: b.minLat - DISTRICT_PADDING_DEG,
        maxLat: b.maxLat + DISTRICT_PADDING_DEG,
        minLon: b.minLon - DISTRICT_PADDING_DEG,
        maxLon: b.maxLon + DISTRICT_PADDING_DEG,
      },
    ];
  }),
) as Record<CaltransDistrict, Box>;

/** Distance in meters from a point to the nearest edge of a box (0 if the point is inside). */
function distanceToBox(point: LatLon, box: Box): number {
  // The closest point of the box is the point itself, pushed inside the box's edges.
  const closest = {
    lat: Math.min(Math.max(point.lat, box.minLat), box.maxLat),
    lon: Math.min(Math.max(point.lon, box.minLon), box.maxLon),
  };
  return distanceMeters(point, closest);
}

/**
 * The districts whose (padded) box overlaps the search circle, in district order.
 *
 * If the circle falls in a gap between boxes (for example just off the coast), we still
 * return the single nearest district, so a search inside California never loads nothing.
 */
export function districtsNear(center: LatLon, radiusMeters: number): CaltransDistrict[] {
  const distances = CALTRANS_DISTRICTS.map((d) => ({
    district: d,
    distance: distanceToBox(center, DISTRICT_BOXES[d]),
  }));
  const near = distances.filter((d) => d.distance <= radiusMeters).map((d) => d.district);
  if (near.length > 0) return near;

  const nearest = distances.reduce((best, d) => (d.distance < best.distance ? d : best));
  return [nearest.district];
}
