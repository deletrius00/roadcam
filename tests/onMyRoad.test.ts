import { describe, expect, it } from 'vitest';
import { filterToRoute } from '../src/lib/onMyRoad';

function placed(id: string, route: string, relation: 'ahead' | 'behind' | 'side' = 'ahead') {
  return { camera: { id, route }, relation };
}

const i5Ahead = placed('i5-ahead', 'I-5', 'ahead');
const i5Behind = placed('i5-behind', 'I-5', 'behind');
const sr138Ahead = placed('sr138-ahead', 'SR-138', 'ahead');
const i405Behind = placed('i405-behind', 'I-405', 'behind');
const noRoute = placed('no-route', '', 'ahead');
const all = [i5Ahead, sr138Ahead, i5Behind, i405Behind, noRoute];

describe('filterToRoute', () => {
  it('keeps every camera when the filter is off', () => {
    expect(filterToRoute(all, 'I-5', false)).toEqual(all);
  });

  it('keeps only cameras on your highway when the filter is on', () => {
    expect(filterToRoute(all, 'I-5', true)).toEqual([i5Ahead, i5Behind]);
  });

  it('filters both ahead and behind cameras', () => {
    const result = filterToRoute(all, 'I-5', true);
    expect(result.map((p) => p.relation)).toEqual(['ahead', 'behind']);
  });

  it('keeps every camera when no highway is guessed, even if the filter is on', () => {
    expect(filterToRoute(all, null, true)).toEqual(all);
    expect(filterToRoute(all, '   ', true)).toEqual(all);
  });

  it('ignores extra spaces around route names', () => {
    const padded = placed('padded', ' I-5 ');
    expect(filterToRoute([padded, sr138Ahead], 'I-5', true)).toEqual([padded]);
    expect(filterToRoute([i5Ahead, sr138Ahead], ' I-5', true)).toEqual([i5Ahead]);
  });

  it('matches the whole route name, not part of it', () => {
    const i50 = placed('i50', 'I-50');
    expect(filterToRoute([i5Ahead, i50], 'I-5', true)).toEqual([i5Ahead]);
  });

  it('returns an empty list when no camera is on your highway', () => {
    expect(filterToRoute([sr138Ahead, i405Behind], 'I-5', true)).toEqual([]);
  });

  it('keeps the original order and does not change the input', () => {
    const input = [...all];
    filterToRoute(input, 'I-5', true);
    expect(input).toEqual(all);
  });
});
