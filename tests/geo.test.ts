import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  bearingDeg,
  classifyRelation,
  compassLabel,
  distanceMeters,
  formatDistance,
  normalizeDeg,
} from '../src/lib/geo';

const LA = { lat: 34.0522, lon: -118.2437 };
const SF = { lat: 37.7749, lon: -122.4194 };

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters(LA, LA)).toBe(0);
  });

  it('matches the known LA to SF distance (~559 km)', () => {
    expect(distanceMeters(LA, SF) / 1000).toBeCloseTo(559, -1);
  });
});

describe('bearingDeg', () => {
  const origin = { lat: 34, lon: -118 };
  it('points north, east, south, west correctly', () => {
    expect(bearingDeg(origin, { lat: 34.1, lon: -118 })).toBeCloseTo(0, 0);
    expect(bearingDeg(origin, { lat: 34, lon: -117.9 })).toBeCloseTo(90, 0);
    expect(bearingDeg(origin, { lat: 33.9, lon: -118 })).toBeCloseTo(180, 0);
    expect(bearingDeg(origin, { lat: 34, lon: -118.1 })).toBeCloseTo(270, 0);
  });
});

describe('angleBetween', () => {
  it('handles wrap-around at north', () => {
    expect(angleBetween(350, 10)).toBe(20);
    expect(angleBetween(10, 350)).toBe(20);
  });
  it('never exceeds 180', () => {
    expect(angleBetween(0, 180)).toBe(180);
    expect(angleBetween(90, 271)).toBe(179);
  });
});

describe('classifyRelation', () => {
  const me = { lat: 34, lon: -118 };
  const north = { lat: 34.2, lon: -118 };
  const south = { lat: 33.8, lon: -118 };
  const east = { lat: 34, lon: -117.8 };

  it('heading north: camera to the north is ahead, south is behind, east is side', () => {
    expect(classifyRelation(me, 0, north)).toBe('ahead');
    expect(classifyRelation(me, 0, south)).toBe('behind');
    expect(classifyRelation(me, 0, east)).toBe('side');
  });

  it('heading south flips ahead and behind', () => {
    expect(classifyRelation(me, 180, north)).toBe('behind');
    expect(classifyRelation(me, 180, south)).toBe('ahead');
  });

  it('respects a custom cone width', () => {
    const northEast = { lat: 34.1, lon: -117.9 }; // bearing ~40°
    expect(classifyRelation(me, 0, northEast, 30)).toBe('side');
    expect(classifyRelation(me, 0, northEast, 60)).toBe('ahead');
  });
});

describe('helpers', () => {
  it('normalizeDeg wraps negatives and >360', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
  });

  it('compassLabel rounds to the nearest of 8 directions', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(44)).toBe('NE');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(200)).toBe('S');
  });

  it('formatDistance switches between feet and miles', () => {
    expect(formatDistance(50)).toBe('164 ft');
    expect(formatDistance(1609.344 * 2.345)).toBe('2.3 mi');
    expect(formatDistance(1609.344 * 42.6)).toBe('43 mi');
  });
});
