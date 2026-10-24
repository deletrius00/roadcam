import { describe, expect, it } from 'vitest';
import { resolveHeading } from '../src/lib/heading';

const here = { lat: 34, lon: -118 };

describe('resolveHeading', () => {
  it('uses the device heading when moving', () => {
    expect(resolveHeading({ ...here, heading: 123, speed: 20 }, null)).toBe(123);
  });

  it('ignores the device heading when nearly stopped (it is just noise)', () => {
    expect(resolveHeading({ ...here, heading: 123, speed: 0.5 }, null)).toBeNull();
  });

  it('computes heading from movement when the device gives none', () => {
    const earlier = { lat: 33.999, lon: -118 }; // ~111 m south
    const heading = resolveHeading({ ...here, heading: null, speed: null }, earlier);
    expect(heading).not.toBeNull();
    expect(heading!).toBeCloseTo(0, 0); // moving north
  });

  it('returns null if we have not moved far enough to tell', () => {
    const earlier = { lat: 33.9999, lon: -118 }; // ~11 m
    expect(resolveHeading({ ...here, heading: null, speed: null }, earlier)).toBeNull();
  });

  it('ignores NaN device headings', () => {
    const earlier = { lat: 34, lon: -118.001 }; // ~92 m west
    const heading = resolveHeading({ ...here, heading: Number.NaN, speed: 20 }, earlier);
    expect(heading!).toBeCloseTo(90, 0); // moving east
  });
});
