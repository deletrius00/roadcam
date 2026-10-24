import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RADIUS_MILES,
  RADIUS_KEY,
  RADIUS_OPTIONS,
  loadRadiusMiles,
  parseRadiusMiles,
  saveRadiusMiles,
  type SettingsStorage,
} from '../src/lib/settings';

/** A tiny in-memory stand-in for localStorage. */
function fakeStorage(initial: Record<string, string> = {}): SettingsStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

/** Storage that throws on every call, like Safari private browsing used to. */
const throwingStorage: SettingsStorage = {
  getItem: () => {
    throw new Error('SecurityError: storage disabled');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('parseRadiusMiles', () => {
  it('uses a valid saved value', () => {
    expect(parseRadiusMiles('50')).toBe(50);
    expect(parseRadiusMiles('10')).toBe(10);
  });

  it('defaults to 25 when nothing is saved', () => {
    expect(parseRadiusMiles(null)).toBe(DEFAULT_RADIUS_MILES);
    expect(DEFAULT_RADIUS_MILES).toBe(25);
  });

  it.each(['', 'banana', 'NaN', '{"miles":50}', 'undefined'])('defaults to 25 for garbage %j', (saved) => {
    expect(parseRadiusMiles(saved)).toBe(25);
  });

  it.each(['30', '0', '-25', '25.5', '100'])('defaults to 25 for %j, which is not one of the options', (saved) => {
    expect(RADIUS_OPTIONS).not.toContain(Number(saved));
    expect(parseRadiusMiles(saved)).toBe(25);
  });

  it('accepts every option in the list', () => {
    for (const miles of RADIUS_OPTIONS) expect(parseRadiusMiles(String(miles))).toBe(miles);
  });
});

describe('loadRadiusMiles', () => {
  it('reads a valid saved value from the roadcam.radiusMiles key', () => {
    expect(RADIUS_KEY).toBe('roadcam.radiusMiles');
    expect(loadRadiusMiles(() => fakeStorage({ 'roadcam.radiusMiles': '50' }))).toBe(50);
  });

  it('defaults to 25 when the key is missing', () => {
    expect(loadRadiusMiles(() => fakeStorage())).toBe(25);
  });

  it('defaults to 25 for a garbage value', () => {
    expect(loadRadiusMiles(() => fakeStorage({ 'roadcam.radiusMiles': 'lots' }))).toBe(25);
  });

  it('defaults to 25 for a number that is not an option', () => {
    expect(loadRadiusMiles(() => fakeStorage({ 'roadcam.radiusMiles': '75' }))).toBe(25);
  });

  it('defaults to 25 when storage throws on read', () => {
    expect(loadRadiusMiles(() => throwingStorage)).toBe(25);
  });

  it('defaults to 25 when even getting the storage object throws', () => {
    const noStorage = (): SettingsStorage => {
      throw new Error('SecurityError: access denied');
    };
    expect(loadRadiusMiles(noStorage)).toBe(25);
  });
});

describe('saveRadiusMiles', () => {
  it('saves the radius under roadcam.radiusMiles, and it loads back', () => {
    const storage = fakeStorage();
    saveRadiusMiles(50, () => storage);
    expect(storage.data).toEqual({ 'roadcam.radiusMiles': '50' });
    expect(loadRadiusMiles(() => storage)).toBe(50);
  });

  it('does not throw when storage throws on write', () => {
    expect(() => saveRadiusMiles(10, () => throwingStorage)).not.toThrow();
  });

  it('does not throw when getting the storage object throws', () => {
    const noStorage = (): SettingsStorage => {
      throw new Error('SecurityError: access denied');
    };
    expect(() => saveRadiusMiles(10, noStorage)).not.toThrow();
  });
});
