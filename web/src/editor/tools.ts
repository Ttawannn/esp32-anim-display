// Pixel drawing operations on RGBA buffers. Colors are packed as [r, g, b, a].
import type { Pixels } from '../model/types';

export type Tool = 'select' | 'pencil' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'fill' | 'picker' | 'move';
export type RGBA = [number, number, number, number];

export const TRANSPARENT: RGBA = [0, 0, 0, 0];

export interface Surface {
  data: Pixels;
  w: number;
  h: number;
  mirror: boolean; // also paint the horizontally mirrored pixel
}

export function hexToRgba(hex: string): RGBA {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
}

function put(s: Surface, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
  s.data.set(c, (y * s.w + x) * 4);
}

export function plot(s: Surface, x: number, y: number, c: RGBA, size = 1) {
  const o = Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      put(s, x - o + dx, y - o + dy, c);
      if (s.mirror) put(s, s.w - 1 - (x - o + dx), y - o + dy, c);
    }
}

export function getPixel(data: Pixels, w: number, x: number, y: number): RGBA {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

export function line(s: Surface, x0: number, y0: number, x1: number, y1: number, c: RGBA, size = 1) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(s, x0, y0, c, size);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function rect(s: Surface, x0: number, y0: number, x1: number, y1: number, c: RGBA, filled: boolean) {
  const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++)
      if (filled || x === ax || x === bx || y === ay || y === by) plot(s, x, y, c);
}

// Ellipse inscribed in the drag rectangle (midpoint algorithm, works for even sizes).
export function ellipse(s: Surface, x0: number, y0: number, x1: number, y1: number, c: RGBA, filled: boolean) {
  const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
  const cx = (ax + bx) / 2, cy = (ay + by) / 2;
  const rx = (bx - ax) / 2 + 0.5, ry = (by - ay) / 2 + 0.5;
  for (let y = ay; y <= by; y++) {
    const ny = (y - cy) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - ny * ny));
    const left = Math.round(cx - half + 0.5), right = Math.round(cx + half - 0.5);
    if (filled) {
      for (let x = left; x <= right; x++) plot(s, x, y, c);
    } else {
      plot(s, left, y, c);
      plot(s, right, y, c);
    }
  }
  if (!filled) {
    // Close gaps on the flat top/bottom by also scanning columns.
    for (let x = ax; x <= bx; x++) {
      const nx = (x - cx) / rx;
      const half = ry * Math.sqrt(Math.max(0, 1 - nx * nx));
      plot(s, x, Math.round(cy - half + 0.5), c);
      plot(s, x, Math.round(cy + half - 0.5), c);
    }
  }
}

export function floodFill(s: Surface, x: number, y: number, c: RGBA) {
  const { data, w, h } = s;
  const target = getPixel(data, w, x, y);
  if (target.every((v, i) => v === c[i])) return;
  const same = (i: number) =>
    data[i] === target[0] && data[i + 1] === target[1] && data[i + 2] === target[2] && data[i + 3] === target[3];
  const stack = [x, y];
  const filled: number[] = [];
  while (stack.length) {
    const py = stack.pop()!, px = stack.pop()!;
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const i = (py * w + px) * 4;
    if (!same(i)) continue;
    data.set(c, i);
    filled.push(px, py);
    stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
  }
  if (s.mirror) for (let k = 0; k < filled.length; k += 2) put(s, w - 1 - filled[k], filled[k + 1], c);
}

// Shift the whole image; pixels moved out are dropped, uncovered pixels become transparent.
export function shifted(src: Pixels, w: number, h: number, dx: number, dy: number): Pixels {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= w) continue;
      out.set(src.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return out;
}

export function flipH(src: Pixels, w: number, h: number): Pixels {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out.set(src.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (y * w + (w - 1 - x)) * 4);
  return out;
}

export function flipV(src: Pixels, w: number, h: number): Pixels {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) out.set(src.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
  return out;
}

// Replace one exact color (ignoring alpha 0 pixels) in a frame. Returns null when nothing changed.
export function replaceColor(src: Pixels, from: RGBA, to: RGBA): Pixels | null {
  let out: Pixels | null = null;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] && src[i] === from[0] && src[i + 1] === from[1] && src[i + 2] === from[2]) {
      out ??= src.slice();
      out.set(to, i);
    }
  }
  return out;
}

// Distinct opaque colors in the frames, most used first. Stops counting past `limit`.
export function usedColors(frames: Pixels[], limit = 64): { colors: string[]; overflow: boolean } {
  const counts = new Map<number, number>();
  for (const d of frames) {
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      counts.set(k, (counts.get(k) ?? 0) + 1);
      if (counts.size > limit) return { colors: [], overflow: true };
    }
  }
  const colors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => '#' + k.toString(16).padStart(6, '0'));
  return { colors, overflow: false };
}
