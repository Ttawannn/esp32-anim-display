import type { Dither } from '../model/types';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Grayscale -> 1 bit per pixel (1 = lit). `threshold` shifts the midpoint for every dither mode.
export function toMono(gray: Uint8Array, w: number, h: number, threshold: number, dither: Dither): Uint8Array {
  const out = new Uint8Array(w * h);
  const bias = 128 - threshold;
  if (dither === 'none') {
    for (let i = 0; i < out.length; i++) out[i] = gray[i] >= threshold ? 1 : 0;
    return out;
  }
  if (dither === 'bayer') {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        out[i] = gray[i] + bias > BAYER4[(y & 3) * 4 + (x & 3)] * 16 + 8 ? 1 : 0;
      }
    return out;
  }
  // Error diffusion
  const buf = new Float32Array(w * h);
  for (let i = 0; i < buf.length; i++) buf[i] = gray[i] + bias;
  const atkinson = dither === 'atkinson';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = buf[i];
      const on = v >= 128 ? 1 : 0;
      out[i] = on;
      const err = v - on * 255;
      if (atkinson) {
        const e = err / 8;
        spread(buf, w, h, x + 1, y, e);
        spread(buf, w, h, x + 2, y, e);
        spread(buf, w, h, x - 1, y + 1, e);
        spread(buf, w, h, x, y + 1, e);
        spread(buf, w, h, x + 1, y + 1, e);
        spread(buf, w, h, x, y + 2, e);
      } else {
        spread(buf, w, h, x + 1, y, (err * 7) / 16);
        spread(buf, w, h, x - 1, y + 1, (err * 3) / 16);
        spread(buf, w, h, x, y + 1, (err * 5) / 16);
        spread(buf, w, h, x + 1, y + 1, err / 16);
      }
    }
  }
  return out;
}

function spread(buf: Float32Array, w: number, h: number, x: number, y: number, e: number) {
  if (x >= 0 && x < w && y < h) buf[y * w + x] += e;
}
