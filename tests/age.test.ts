import { describe, expect, it } from 'vitest';
import { ageMs, formatAge, freshness } from '../src/lib/age';

const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;

describe('formatAge', () => {
  const cases: Array<[number, string]> = [
    [0, 'just now'],
    [4 * SEC, 'just now'],
    [42 * SEC, '42 sec ago'],
    [7 * MIN + 30 * SEC, '7 min ago'],
    [2 * HR, '2 hr ago'],
    [2 * HR + 5 * MIN, '2 hr 5 min ago'],
    [26 * HR, '1 day ago'],
    [75 * HR, '3 days ago'],
  ];
  it.each(cases)('%i ms -> %s', (input, expected) => {
    expect(formatAge(input)).toBe(expected);
  });

  it('treats small negative ages (clock skew) as just now', () => {
    expect(formatAge(-3 * SEC)).toBe('just now');
  });

  it('handles unknown ages', () => {
    expect(formatAge(Number.NaN)).toBe('time unknown');
  });
});

describe('ageMs', () => {
  const now = Date.parse('2026-10-23T22:00:00Z');
  it('computes age from an ISO time', () => {
    expect(ageMs('2026-10-23T21:55:00Z', now)).toBe(5 * MIN);
  });
  it('returns NaN for missing or invalid times', () => {
    expect(ageMs(null, now)).toBeNaN();
    expect(ageMs('not a date', now)).toBeNaN();
  });
});

describe('freshness', () => {
  it('buckets ages', () => {
    expect(freshness(1 * MIN)).toBe('fresh');
    expect(freshness(10 * MIN)).toBe('aging');
    expect(freshness(45 * MIN)).toBe('stale');
    expect(freshness(Number.NaN)).toBe('unknown');
  });
});
