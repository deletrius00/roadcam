/**
 * Spotting "Temporarily Unavailable" / "Down for Construction" pictures.
 *
 * When a Caltrans camera is down, its image URL still works but serves a white card with
 * blue text, re-stamped with the current time every few minutes. So the image *looks* fresh
 * and is about the same file size as a real night-time picture: neither the timestamp nor the
 * size gives it away.
 *
 * What does: JPEG pictures are stored top-to-bottom in small blocks. A placeholder's top rows
 * are plain white, and plain white blocks encode as a short byte pattern repeated over and
 * over. A real camera picture never starts with a perfectly repeating pattern.
 *
 * Checked against all 592 district-7 cameras on 23 Oct 2026: 392/392 placeholders detected,
 * 0 real pictures flagged. Only the first ~3 KB of each image is needed.
 */

/** Bytes to download from each image to run the check. */
export const PLACEHOLDER_PROBE_BYTES = 3000;

/** Where the picture data starts (just after the JPEG "start of scan" header), or -1. */
export function jpegScanStart(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return -1; // not a JPEG
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return -1;
    const marker = bytes[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (marker === 0xda) return i + 2 + length;
    i += 2 + length;
  }
  return -1;
}

/** True if the picture data begins with a short pattern repeated (a blank, single-color top). */
export function isPlaceholderImage(bytes: Uint8Array): boolean {
  const start = jpegScanStart(bytes);
  if (start < 0) return false;
  const window = bytes.subarray(start + 4, start + 4 + 64);
  if (window.length < 64) return false;
  for (let period = 1; period <= 16; period++) {
    let repeats = true;
    for (let i = 0; i + period < window.length; i++) {
      if (window[i] !== window[i + period]) {
        repeats = false;
        break;
      }
    }
    if (repeats) return true;
  }
  return false;
}
