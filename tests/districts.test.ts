import { describe, expect, it } from 'vitest';
import { CALTRANS_DISTRICTS, parseCaltransFeed } from '../server/caltrans';
import { DISTRICT_BOXES, districtsNear } from '../server/districts';
import { METERS_PER_MILE } from '../src/lib/geo';
import sample from './fixtures/caltrans-sample.json';

const miles = (n: number) => n * METERS_PER_MILE;

const CENTRAL_LA = { lat: 34.05, lon: -118.25 };
const SAN_FRANCISCO = { lat: 37.77, lon: -122.42 };
const SAN_DIEGO = { lat: 32.72, lon: -117.16 };
// In the Pacific, west of Big Sur: inside the "California" region but in no district's box.
const OFFSHORE_BIG_SUR = { lat: 36.0, lon: -123.0 };

describe('districtsNear', () => {
  it('loads district 7 (and maybe 8 or 12) for central Los Angeles, never 1 or 2', () => {
    const districts = districtsNear(CENTRAL_LA, miles(25));
    expect(districts).toContain(7);
    expect(districts).not.toContain(1);
    expect(districts).not.toContain(2);
    expect(districts.every((d) => [7, 8, 12].includes(d))).toBe(true);
  });

  it('needs only a few districts for a typical search', () => {
    for (const center of [CENTRAL_LA, SAN_FRANCISCO, SAN_DIEGO]) {
      expect(districtsNear(center, miles(25)).length).toBeLessThanOrEqual(3);
    }
  });

  it('finds the home district of each big city', () => {
    expect(districtsNear(SAN_FRANCISCO, miles(5))).toContain(4);
    expect(districtsNear(SAN_DIEGO, miles(5))).toEqual([11]);
  });

  it('still returns the nearest district when the search falls in a gap between boxes', () => {
    expect(districtsNear(OFFSHORE_BIG_SUR, miles(1))).toEqual([5]);
  });

  it('returns more districts for a bigger radius, never fewer', () => {
    const small = districtsNear(CENTRAL_LA, miles(5));
    const big = districtsNear(CENTRAL_LA, miles(100));
    expect(big.length).toBeGreaterThan(small.length);
    for (const d of small) expect(big).toContain(d);
  });

  it('lists each district once, in district order', () => {
    const districts = districtsNear(CENTRAL_LA, miles(100));
    expect(districts).toEqual([...new Set(districts)].sort((a, b) => a - b));
  });

  it('has a sensible box for every district', () => {
    for (const d of CALTRANS_DISTRICTS) {
      const box = DISTRICT_BOXES[d];
      expect(box.minLat).toBeLessThan(box.maxLat);
      expect(box.minLon).toBeLessThan(box.maxLon);
    }
  });

  it("puts every camera in the real district 7 sample inside district 7's box", () => {
    const box = DISTRICT_BOXES[7];
    const cameras = parseCaltransFeed(sample);
    expect(cameras.length).toBeGreaterThan(0);
    for (const c of cameras) {
      expect(c.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(c.lat).toBeLessThanOrEqual(box.maxLat);
      expect(c.lon).toBeGreaterThanOrEqual(box.minLon);
      expect(c.lon).toBeLessThanOrEqual(box.maxLon);
    }
  });
});

/**
 * Where each district's cameras actually are: the corners of the smallest box around all of
 * that district's live cameras (from the 12 Caltrans feeds, 3,605 cameras, Oct 24 2026).
 * If every corner is inside the district's box, every camera is too.
 * Re-check this against the live feeds before shrinking any box.
 */
const LIVE_CAMERA_SPREAD: Record<number, [minLat: number, maxLat: number, minLon: number, maxLon: number]> = {
  1: [38.7523, 41.994, -124.1993, -122.6042],
  2: [39.7748, 41.9966, -122.9912, -120.0385],
  3: [38.078, 39.7895, -122.1593, -119.9572],
  4: [36.9192, 38.5264, -122.79, -121.5128],
  5: [34.3851, 37.1304, -122.0232, -119.4868],
  6: [34.8177, 37.331, -120.7238, -118.8074],
  7: [33.747, 34.7948, -119.2943, -117.6947],
  8: [33.4385, 35.602, -117.7438, -114.5503],
  9: [34.9875, 38.3506, -119.4504, -117.8692],
  10: [36.9772, 38.4077, -121.6755, -119.9504],
  11: [32.5514, 33.3423, -117.3883, -115.4986],
  12: [33.3965, 33.9422, -118.0918, -117.5934],
};

describe('district boxes cover the real cameras', () => {
  it.each(CALTRANS_DISTRICTS.map((d) => [d]))('district %s: every live camera is inside its box', (d) => {
    const spread = LIVE_CAMERA_SPREAD[d];
    if (!spread) throw new Error(`no live camera spread recorded for district ${d}`);
    const [minLat, maxLat, minLon, maxLon] = spread;
    for (const lat of [minLat, maxLat]) {
      for (const lon of [minLon, maxLon]) {
        expect(districtsNear({ lat, lon }, 0)).toContain(d);
      }
    }
  });

  it('finds the District 9 cameras near Mojave (they were missed before the fix)', () => {
    // A real camera on SR-58 near Mojave, in District 9's feed.
    expect(districtsNear({ lat: 34.9875, lon: -118.1589 }, miles(1))).toContain(9);
  });
});
