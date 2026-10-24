import { describe, expect, it } from 'vitest';
import { laneGuide, opposite, parseFacing } from '../src/lib/facing';

describe('parseFacing', () => {
  const cases: Array<[string, string | null]> = [
    // Real names from the live Caltrans feeds
    ['SR-20 : At SR-1 - Looking East (C020)', 'East'],
    ['T252W -- SR-123 : Ashby Avenue - Looking West', 'West'],
    ['T258S -- I-80 : Central Avenue Onramp - Looking South', 'South'],
    ['DN-199 : S Of Oregon State Line - Looking East (C016)', 'East'],
    ['Looking South Zoom', 'South'],
    ['Look North Zoom', 'North'],
    // NB/SB describe the roadway, not where the camera points: don't guess
    ['Hwy 80 at Kingvale WB', null],
    ['(C 012) NB 5 : Just North Of Pacific Highway', null],
    ['I-5 : (7) Triggs St', null],
    ['', null],
  ];
  it.each(cases)('%s → %s', (text, expected) => {
    expect(parseFacing(text)).toBe(expected);
  });

  it('checks every text it is given (name, then description)', () => {
    expect(parseFacing('I-5 : Gorman', 'Looking North')).toBe('North');
    expect(parseFacing(undefined, null)).toBeNull();
  });
});

describe('laneGuide', () => {
  it('returns null when the camera direction is unknown', () => {
    expect(laneGuide(null, 0)).toBeNull();
  });

  it('puts traffic going the camera direction on the right (away)', () => {
    expect(laneGuide('North', null)).toEqual({ facing: 'North', away: 'North', toward: 'South', yourSide: null });
  });

  it('says your lanes are moving away when you head the way the camera looks', () => {
    expect(laneGuide('North', 10)?.yourSide).toBe('away');
  });

  it('says your lanes are coming toward the camera when you head the other way', () => {
    expect(laneGuide('North', 185)?.yourSide).toBe('toward');
  });

  it('does not guess when you are crossing at an angle', () => {
    expect(laneGuide('North', 90)?.yourSide).toBeNull();
  });

  it('knows opposites', () => {
    expect(opposite('East')).toBe('West');
  });
});
