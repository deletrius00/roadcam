import { describe, expect, it } from 'vitest';
import { isPlaceholderImage, jpegScanStart } from '../server/placeholder';
import samples from './fixtures/jpeg-samples.json';

const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'));
const entries = Object.entries(samples).filter(([k]) => !k.startsWith('_')) as Array<[string, string]>;

describe('isPlaceholderImage (real Caltrans images)', () => {
  it.each(entries.filter(([k]) => k.startsWith('placeholder')))('%s is a placeholder', (_name, b64) => {
    expect(isPlaceholderImage(bytes(b64))).toBe(true);
  });

  it.each(entries.filter(([k]) => k.startsWith('real')))('%s is a real picture', (_name, b64) => {
    expect(isPlaceholderImage(bytes(b64))).toBe(false);
  });

  it('is not fooled by non-JPEG or truncated data', () => {
    expect(isPlaceholderImage(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(isPlaceholderImage(bytes(entries[0]![1]).subarray(0, 200))).toBe(false);
    expect(jpegScanStart(new Uint8Array([0x89, 0x50]))).toBe(-1);
  });
});
