import { decompressFrames, parseGIF } from 'gifuct-js';
import type { Pixels } from '../model/types';

export interface DecodedGif {
  width: number;
  height: number;
  frames: { data: Pixels; delay: number }[];
}

// Decodes and composites a GIF into full frames (handles frame patches and disposal modes).
export function decodeGif(buffer: ArrayBuffer): DecodedGif {
  const gif = parseGIF(buffer);
  const parts = decompressFrames(gif, true);
  const width = gif.lsd.width, height = gif.lsd.height;
  const canvas = new Uint8ClampedArray(width * height * 4);
  const frames: DecodedGif['frames'] = [];

  for (const part of parts) {
    const { left, top, width: pw, height: ph } = part.dims;
    const before = part.disposalType === 3 ? canvas.slice() : null;
    for (let y = 0; y < ph; y++) {
      const cy = top + y;
      if (cy < 0 || cy >= height) continue;
      for (let x = 0; x < pw; x++) {
        const cx = left + x;
        if (cx < 0 || cx >= width) continue;
        const s = (y * pw + x) * 4;
        if (part.patch[s + 3] === 0) continue; // transparent: keep what is underneath
        const d = (cy * width + cx) * 4;
        canvas[d] = part.patch[s];
        canvas[d + 1] = part.patch[s + 1];
        canvas[d + 2] = part.patch[s + 2];
        canvas[d + 3] = 255;
      }
    }
    // Browsers treat delays under 20 ms as 100 ms; match that so animations play at the expected speed.
    const delay = part.delay < 20 ? 100 : part.delay;
    frames.push({ data: canvas.slice(), delay });

    if (part.disposalType === 2) {
      for (let y = 0; y < ph; y++) {
        const cy = top + y;
        if (cy < 0 || cy >= height) continue;
        const from = (cy * width + Math.max(0, left)) * 4;
        const to = (cy * width + Math.min(width, left + pw)) * 4;
        canvas.fill(0, from, to);
      }
    } else if (before) {
      canvas.set(before);
    }
  }
  return { width, height, frames };
}
