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
