import { describe, expect, it } from 'vitest';
import { formatCountdown, secondsUntilRefresh } from '../src/lib/refresh';

const now = Date.parse('2026-10-24T09:00:00Z');

describe('secondsUntilRefresh', () => {
  it('counts whole seconds until the next refresh', () => {
    expect(secondsUntilRefresh(now + 42_000, now)).toBe(42);
    expect(secondsUntilRefresh(now + 60_000, now)).toBe(60);
  });

  it('rounds up, so it only reaches 0 when the refresh is due', () => {
    expect(secondsUntilRefresh(now + 41_001, now)).toBe(42);
    expect(secondsUntilRefresh(now + 1, now)).toBe(1);
    expect(secondsUntilRefresh(now, now)).toBe(0);
  });

  it('never goes negative when the refresh is late', () => {
    expect(secondsUntilRefresh(now - 3_000, now)).toBe(0);
  });

  it('returns null when nothing is scheduled', () => {
    expect(secondsUntilRefresh(null, now)).toBeNull();
    expect(secondsUntilRefresh(Number.NaN, now)).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('shows the seconds left', () => {
    expect(formatCountdown(42, false)).toBe('next in 42 s');
    expect(formatCountdown(1, false)).toBe('next in 1 s');
  });

  it('says updating while a refresh is running or due', () => {
    expect(formatCountdown(42, true)).toBe('updating…');
    expect(formatCountdown(0, false)).toBe('updating…');
    expect(formatCountdown(null, true)).toBe('updating…');
  });

  it('is empty when nothing is scheduled yet', () => {
    expect(formatCountdown(null, false)).toBe('');
  });
});
