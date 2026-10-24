import { describe, expect, it } from 'vitest';
import { splitNextCamera } from '../src/lib/nextCamera';

function placed(id: string, distance: number, unavailable = false) {
  return { id, distance, camera: { unavailable } };
}

describe('splitNextCamera', () => {
  it('returns nothing when there are no cameras ahead', () => {
    expect(splitNextCamera([])).toEqual({ next: null, rest: [] });
  });

  it('picks the closest camera and leaves the rest in their original order', () => {
    const far = placed('far', 9000);
    const near = placed('near', 1200);
    const mid = placed('mid', 4000);
    const { next, rest } = splitNextCamera([far, near, mid]);
    expect(next).toBe(near);
    expect(rest).toEqual([far, mid]);
  });

  it('never repeats the next camera in the rest of the list', () => {
    const list = [placed('a', 100), placed('b', 200), placed('c', 300)];
    const { next, rest } = splitNextCamera(list);
    expect(rest).not.toContain(next);
    expect(rest).toHaveLength(list.length - 1);
  });

  it('prefers a working camera over a closer offline one', () => {
    const offlineClose = placed('offline', 300, true);
    const workingFar = placed('working', 5000);
    const { next, rest } = splitNextCamera([offlineClose, workingFar]);
    expect(next).toBe(workingFar);
    expect(rest).toEqual([offlineClose]);
  });

  it('falls back to the closest offline camera when every camera ahead is offline', () => {
    const a = placed('a', 3000, true);
    const b = placed('b', 800, true);
    expect(splitNextCamera([a, b]).next).toBe(b);
  });

  it('keeps the first of two equally close cameras', () => {
    const first = placed('first', 1000);
    const second = placed('second', 1000);
    expect(splitNextCamera([first, second]).next).toBe(first);
  });

  it('does not change the list it was given', () => {
    const list = [placed('a', 500), placed('b', 100)];
    splitNextCamera(list);
    expect(list.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
