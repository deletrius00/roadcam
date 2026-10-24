import { describe, expect, it } from 'vitest';
import { guessCurrentRoute } from '../src/lib/route';
import type { Camera } from '../src/lib/types';

function cam(id: string, route: string, lat: number, lon: number, nearbyPlace = ''): Camera {
  return {
    id,
    name: id,
    route,
    direction: 'North',
    nearbyPlace,
    county: '',
    lat,
    lon,
    imageUrl: 'https://example.com/x.jpg',
    updateFrequencyMin: null,
    recordedAt: null,
    facing: null,
  };
}

// Two real I-5 cameras ~6 miles apart near the Grapevine, plus SR-138 heading east.
const gorman = cam('gorman', 'I-5', 34.7958, -118.8462, 'Gorman');
const lebec = cam('lebec', 'I-5', 34.8395, -118.8648, 'Lebec');
const sr138 = cam('sr138', 'SR-138', 34.775, -118.76, 'Quail Lake');

describe('guessCurrentRoute', () => {
  it('finds the highway when you are between two of its cameras', () => {
    const midway = { lat: 34.8177, lon: -118.8555 };
    const guess = guessCurrentRoute(midway, [gorman, lebec, sr138]);
    expect(guess?.route).toBe('I-5');
    expect(guess!.offRouteMeters).toBeLessThan(100);
  });

  it('reports the nearest town on that highway', () => {
    const nearLebec = { lat: 34.835, lon: -118.8628 };
    expect(guessCurrentRoute(nearLebec, [gorman, lebec])?.nearbyPlace).toBe('Lebec');
  });

  it('counts a single camera right next to you', () => {
    const atSr138 = { lat: 34.7752, lon: -118.7605 };
    expect(guessCurrentRoute(atSr138, [gorman, lebec, sr138])?.route).toBe('SR-138');
  });

  it('returns null when you are well away from every highway', () => {
    const offRoad = { lat: 34.9, lon: -118.6 };
    expect(guessCurrentRoute(offRoad, [gorman, lebec, sr138])).toBeNull();
  });

  it('does not join cameras that are too far apart to trace one road', () => {
    const far = cam('far', 'I-5', 35.2, -119.1);
    const between = { lat: 35.0, lon: -118.98 }; // near the straight line, but 30+ miles between cameras
    expect(guessCurrentRoute(between, [gorman, far])).toBeNull();
  });

  it('ignores cameras with no route', () => {
    expect(guessCurrentRoute({ lat: 34.7958, lon: -118.8462 }, [cam('x', '', 34.7958, -118.8462)])).toBeNull();
  });
});
