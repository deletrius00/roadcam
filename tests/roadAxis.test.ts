import { describe, expect, it } from 'vitest';
import { axisDirections, axisLabel, roadAxis } from '../src/lib/roadAxis';
import type { Camera } from '../src/lib/types';

function cam(id: string, route: string, lat: number, lon: number): Camera {
  return { id, name: id, route, direction: '', nearbyPlace: '', county: '', lat, lon, imageUrl: '', updateFrequencyMin: null, recordedAt: null, facing: null };
}

// Real camera positions near the Grapevine.
const gorman = cam('gorman', 'I-5', 34.7958, -118.8462);
const lebec = cam('lebec', 'I-5', 34.8395, -118.8648);
const frazier = cam('frazier', 'I-5', 34.8203, -118.861);
const sr138a = cam('138a', 'SR-138', 34.775, -118.76);
const sr138b = cam('138b', 'SR-138', 34.7712, -118.7052);

describe('roadAxis', () => {
  it('finds that I-5 runs roughly north–south over the Grapevine', () => {
    const axis = roadAxis(frazier, [gorman, lebec, frazier, sr138a]);
    expect(axis).not.toBeNull();
    expect(axisLabel(axis!)).toBe('north–south');
  });

  it('finds that SR-138 runs east–west', () => {
    expect(axisLabel(roadAxis(sr138a, [sr138a, sr138b, gorman])!)).toBe('east–west');
  });

  it('only uses cameras on the same highway', () => {
    expect(roadAxis(sr138a, [sr138a, gorman, lebec])).toBeNull();
  });

  it('ignores neighbours that are too far away to trace the road', () => {
    expect(roadAxis(gorman, [gorman, cam('far', 'I-5', 35.3, -119.1)])).toBeNull();
  });

  it('treats opposite directions as the same road', () => {
    // A camera with one neighbour due north and one due south: road runs north–south.
    const mid = cam('mid', 'X', 34, -118);
    const axis = roadAxis(mid, [mid, cam('n', 'X', 34.02, -118), cam('s', 'X', 33.98, -118)]);
    expect(axisLabel(axis!)).toBe('north–south');
  });
});

describe('axisDirections', () => {
  it('names the two directions along a road', () => {
    expect(axisDirections(0)).toEqual(['north', 'south']);
    expect(axisDirections(178)).toEqual(['north', 'south']);
    expect(axisDirections(90)).toEqual(['east', 'west']);
    expect(axisDirections(40)).toEqual(['northeast', 'southwest']);
    expect(axisDirections(135)).toEqual(['southeast', 'northwest']);
  });
});
