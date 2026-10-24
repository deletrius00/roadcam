import { describe, expect, it } from 'vitest';
import { friendlyCameraName, sideLabel } from '../src/lib/names';

describe('friendlyCameraName', () => {
  const cases: Array<[string, string]> = [
    // Real names from the live Caltrans feed
    ['KER-5-AT TRUCK ESCAPE RAMP (SHOULDER)', 'Truck Escape Ramp (shoulder)'],
    ['KER-5-AT TRUCK ESCAPE RAMP(MEDIAN)', 'Truck Escape Ramp (median)'],
    ['LA-5-AT LEBEC (FRAZIER)', 'Lebec (Frazier)'],
    ['I-5 : (971) Gorman School Dr', 'Gorman School Dr'],
    ['I-5 : (970) Smokey Bear Rd', 'Smokey Bear Rd'],
    // Other formats used around the state
    ['FRE-99-JNO ASHLAN AVE', 'Just north of Ashlan Ave'],
    ['SJ-5-S/O EIGHT MILE RD', 'South of Eight Mile Rd'],
    ['TV320 -- I-80 : West of Truckee', 'West of Truckee'],
    ['SR-58 AT MOJAVE BYPASS', 'SR-58 at Mojave Bypass'],
    ['I-5 : Grapevine Bottom', 'Grapevine Bottom'],
  ];
  it.each(cases)('%s → %s', (raw, expected) => {
    expect(friendlyCameraName(raw)).toBe(expected);
  });

  it('never returns an empty title', () => {
    expect(friendlyCameraName('')).toBe('Unnamed camera');
    expect(friendlyCameraName('I-5 : (12)')).toBe('I-5 : (12)');
  });
});

describe('sideLabel', () => {
  it('describes the side of the road', () => {
    expect(sideLabel('North')).toBe('Northbound side');
    expect(sideLabel('west')).toBe('Westbound side');
    expect(sideLabel('Median')).toBe('Median');
    expect(sideLabel('')).toBe('');
  });
});
