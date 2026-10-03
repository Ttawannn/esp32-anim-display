import type { ColorAdjust } from '../model/types';
import { to565 } from './rgb565';

// Applies brightness/contrast/saturation/hue/invert, composites transparency over `bg`, and returns
// RGB565 pixels (what a TFT will actually show).
export function adjustTo565(src: Uint8ClampedArray, a: ColorAdjust, bg: [number, number, number]): Uint16Array {
  const n = src.length >> 2;
  const out = new Uint16Array(n);
  const lut = toneLut(a);
  const m = colorMatrix(a.saturation, a.hue);
  const identity = a.saturation === 0 && a.hue === 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let r = src[p], g = src[p + 1], b = src[p + 2];
    const alpha = src[p + 3];
    if (alpha < 255) {
      const k = alpha / 255;
      r = r * k + bg[0] * (1 - k);
      g = g * k + bg[1] * (1 - k);
      b = b * k + bg[2] * (1 - k);
    }
    if (!identity) {
      const nr = m[0] * r + m[1] * g + m[2] * b;
      const ng = m[3] * r + m[4] * g + m[5] * b;
      const nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr < 0 ? 0 : nr > 255 ? 255 : nr;
      g = ng < 0 ? 0 : ng > 255 ? 255 : ng;
      b = nb < 0 ? 0 : nb > 255 ? 255 : nb;
    }
    out[i] = to565(lut[r | 0], lut[g | 0], lut[b | 0]);
  }
  return out;
}

// Grayscale 0..255 after adjustments, for mono panels.
export function adjustToLuma(src: Uint8ClampedArray, a: ColorAdjust, bg: [number, number, number]): Uint8Array {
  const n = src.length >> 2;
  const out = new Uint8Array(n);
  const lut = toneLut(a);
  const bgLuma = luma(bg[0], bg[1], bg[2]);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let y = luma(src[p], src[p + 1], src[p + 2]);
    const alpha = src[p + 3];
    if (alpha < 255) y = (y * alpha + bgLuma * (255 - alpha)) / 255;
    out[i] = lut[y | 0];
  }
  return out;
}

export function luma(r: number, g: number, b: number): number {
  return (r * 77 + g * 150 + b * 29) >> 8;
}

// Brightness, contrast and invert as a per-channel lookup table.
function toneLut(a: ColorAdjust): Uint8Array {
  const lut = new Uint8Array(256);
  const c = a.contrast * 2.55;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  const bright = a.brightness * 2.55;
  for (let v = 0; v < 256; v++) {
    let x = factor * (v + bright - 128) + 128;
    x = x < 0 ? 0 : x > 255 ? 255 : x;
    lut[v] = a.invert ? 255 - x : x;
  }
  return lut;
}

// Saturation then hue rotation as one 3x3 matrix. Coefficients are the SVG/CSS
// feColorMatrix "saturate" and "hueRotate" definitions.
function colorMatrix(saturation: number, hueDeg: number): number[] {
  const s = 1 + saturation / 100;
  const sat = [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
  const h = (hueDeg * Math.PI) / 180;
  const cos = Math.cos(h), sin = Math.sin(h);
  const hue = [
    0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
  ];
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      for (let k = 0; k < 3; k++) out[r * 3 + c] += hue[r * 3 + k] * sat[k * 3 + c];
  return out;
}
