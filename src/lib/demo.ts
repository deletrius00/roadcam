/**
 * Demo mode: a pretend drive north on I-5 over the Grapevine, with pretend cameras.
 * Used for trying the app from your couch, for screenshots, and for automated tests.
 * Turn it on with `?demo=1` in the URL.
 */
import type { Compass } from './facing.js';
import type { Camera, Incident, LatLon, NearbyCamera, SignMessage } from './types.js';
import { distanceMeters } from './geo.js';
import { roadAxis } from './roadAxis.js';

/** The simulated car follows these points in order (roughly I-5 northbound). */
export const DEMO_ROUTE: LatLon[] = [
  { lat: 34.4434, lon: -118.6101 },
  { lat: 34.4892, lon: -118.6227 },
  { lat: 34.5402, lon: -118.6365 },
  { lat: 34.6012, lon: -118.6893 },
  { lat: 34.6655, lon: -118.7448 },
  { lat: 34.7237, lon: -118.7876 },
  { lat: 34.7802, lon: -118.8358 },
  { lat: 34.8295, lon: -118.8655 },
  { lat: 34.8768, lon: -118.8902 },
  { lat: 34.9381, lon: -118.9211 },
  { lat: 34.9913, lon: -118.9448 },
];

interface DemoCameraSeed {
  name: string;
  at: LatLon;
  scene: string;
  /** How old the demo image should look, in seconds. */
  ageSec: number;
  direction: string;
  /** Which way the demo camera points (some real cameras say, most don't). */
  facing?: Compass;
  /** Pretend this camera is down. */
  down?: boolean;
}

const SEEDS: DemoCameraSeed[] = [
  { name: 'I-5 : Valencia Blvd', at: { lat: 34.4155, lon: -118.5935 }, scene: 'day', ageSec: 95, direction: 'North' },
  { name: 'I-5 : Lake Hughes Rd - Looking North', at: { lat: 34.4729, lon: -118.6181 }, scene: 'day', ageSec: 40, direction: 'North', facing: 'North' },
  { name: 'I-5 : Templin Hwy - Looking South', at: { lat: 34.5525, lon: -118.6452 }, scene: 'dusk', ageSec: 160, direction: 'South', facing: 'South' },
  { name: 'I-5 : Smokey Bear Rd', at: { lat: 34.6311, lon: -118.7139 }, scene: 'fog', ageSec: 420, direction: 'North' },
  { name: 'I-5 : Gorman Post Rd', at: { lat: 34.7958, lon: -118.8462 }, scene: 'offline', ageSec: 60, direction: 'North', down: true },
  { name: 'I-5 : Frazier Park', at: { lat: 34.8203, lon: -118.8610 }, scene: 'snow', ageSec: 75, direction: 'South' },
  { name: 'I-5 : Fort Tejon', at: { lat: 34.8803, lon: -118.8925 }, scene: 'day', ageSec: 2700, direction: 'North' },
  { name: 'I-5 : Grapevine Bottom', at: { lat: 34.9611, lon: -118.9302 }, scene: 'dusk', ageSec: 11_000, direction: 'North' },
];

export function demoCameras(): Camera[] {
  return SEEDS.map((s, i) => ({
    id: `demo-${i + 1}`,
    name: s.name,
    route: 'I-5',
    direction: s.direction,
    nearbyPlace: 'Demo',
    county: 'Demo County',
    lat: s.at.lat,
    lon: s.at.lon,
    imageUrl: `/demo/${s.scene}.svg`,
    updateFrequencyMin: 5,
    recordedAt: null,
    facing: s.facing ?? null,
  }));
}

/** Demo cameras near `center`, with believable image ages relative to `now`. */
export function demoNearby(center: LatLon, radiusMeters: number, now: number): NearbyCamera[] {
  const all = demoCameras();
  return all
    .map((camera, i) => ({
      ...camera,
      distanceMeters: distanceMeters(center, camera),
      imageTakenAt: new Date(now - (SEEDS[i]?.ageSec ?? 0) * 1000).toISOString(),
      imageTimeSource: 'demo' as const,
      unavailable: SEEDS[i]?.down ?? false,
      roadAxisDeg: camera.facing ? null : roadAxis(camera, all),
    }))
    .filter((c) => c.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Where the simulated car is after `elapsedMs`, driving the route at `speedMps`. */
export function demoPosition(elapsedMs: number, speedMps = 29): { position: LatLon; heading: number | null } {
  const legs: Array<{ from: LatLon; to: LatLon; length: number }> = [];
  for (let i = 0; i < DEMO_ROUTE.length - 1; i++) {
    const from = DEMO_ROUTE[i]!;
    const to = DEMO_ROUTE[i + 1]!;
    legs.push({ from, to, length: distanceMeters(from, to) });
  }
  const total = legs.reduce((sum, leg) => sum + leg.length, 0);
  // Loop forever so the demo never runs out of road.
  let travelled = ((elapsedMs / 1000) * speedMps) % total;
  for (const leg of legs) {
    if (travelled <= leg.length) {
      const f = travelled / leg.length;
      return {
        position: {
          lat: leg.from.lat + (leg.to.lat - leg.from.lat) * f,
          lon: leg.from.lon + (leg.to.lon - leg.from.lon) * f,
        },
        heading: null, // let the app work out heading from movement, like many real phones
      };
    }
    travelled -= leg.length;
  }
  return { position: DEMO_ROUTE[0]!, heading: null };
}

/** Pretend traffic for demo mode: a crash ahead, a stalled car behind, and two message signs. */
export function demoTraffic(now: number): {
  incidents: Array<Omit<Incident, 'distanceMeters'>>;
  signs: Array<Omit<SignMessage, 'distanceMeters'>>;
} {
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
  return {
    incidents: [
      { id: 'demo-inc-1', kind: 'Crash', description: 'Traffic collision, no injuries', location: 'I5 N / Frazier Mountain Park Rd', startedAt: minutesAgo(18), lat: 34.8115, lon: -118.8552 },
      { id: 'demo-inc-2', kind: 'Stalled vehicle', description: 'Disabled vehicle in right lane', location: 'I5 N / Hasley Canyon Rd', startedAt: minutesAgo(6), lat: 34.4842, lon: -118.6219 },
      { id: 'demo-inc-3', kind: 'Hazard', description: 'Traffic hazard, debris in lanes', location: 'I5 S / Smokey Bear Rd', startedAt: minutesAgo(41), lat: 34.6402, lon: -118.7216 },
    ],
    signs: [
      { id: 'demo-cms-1', route: 'I-5', direction: 'North', lines: ['GUSTY WINDS', 'OVER SUMMIT', 'USE CAUTION'], postedAt: minutesAgo(95), lat: 34.5871, lon: -118.6731 },
      { id: 'demo-cms-2', route: 'I-5', direction: 'North', lines: ['CRASH AHEAD', 'NEAR FRAZIER PK', 'RIGHT LANE BLOCKED'], postedAt: minutesAgo(15), lat: 34.7412, lon: -118.8029 },
    ],
  };
}
