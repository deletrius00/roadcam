import { describe, expect, it } from 'vitest';
import { caltransFeedUrl, pacificToIso, parseCaltransFeed } from '../server/caltrans';
import sample from './fixtures/caltrans-sample.json';

describe('caltransFeedUrl', () => {
  it('zero-pads the district in the file name', () => {
    expect(caltransFeedUrl(7)).toBe('https://cwwp2.dot.ca.gov/data/d7/cctv/cctvStatusD07.json');
    expect(caltransFeedUrl(11)).toBe('https://cwwp2.dot.ca.gov/data/d11/cctv/cctvStatusD11.json');
  });
});

describe('pacificToIso', () => {
  it('converts summer times using PDT (UTC-7)', () => {
    expect(pacificToIso('2026-07-15', '14:30:00')).toBe('2026-07-15T21:30:00.000Z');
  });

  it('converts winter times using PST (UTC-8)', () => {
    expect(pacificToIso('2026-01-15', '09:00:00')).toBe('2026-01-15T17:00:00.000Z');
  });

  it('crosses midnight UTC correctly', () => {
    expect(pacificToIso('2026-10-23', '20:00:00')).toBe('2026-10-24T03:00:00.000Z');
  });

  it('returns null for missing or malformed input', () => {
    expect(pacificToIso(undefined, '10:00:00')).toBeNull();
    expect(pacificToIso('2026-13', '10:00:00')).toBeNull();
    expect(pacificToIso('2026-01-01', 'noon')).toBeNull();
  });
});

describe('parseCaltransFeed', () => {
  const cameras = parseCaltransFeed(sample);

  it('keeps in-service cameras that have an image', () => {
    expect(cameras.map((c) => c.name)).toEqual(['I-5 : Templin Hwy', 'I-5 : Gorman']);
  });

  it('normalizes fields, including numbers sent as strings', () => {
    expect(cameras[1]).toMatchObject({
      id: 'caltrans-d7-2',
      route: 'I-5',
      direction: 'South',
      lat: 34.7958,
      lon: -118.8462,
      updateFrequencyMin: null,
      recordedAt: '2026-01-15T17:00:00.000Z',
    });
    expect(cameras[0]?.updateFrequencyMin).toBe(5);
  });

  it('returns an empty list for junk input instead of crashing', () => {
    expect(parseCaltransFeed(null)).toEqual([]);
    expect(parseCaltransFeed({})).toEqual([]);
    expect(parseCaltransFeed({ data: [{}, { cctv: {} }] })).toEqual([]);
  });
});
