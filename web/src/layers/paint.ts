// Paint layers: drawings that move and scale as one object. Each frame holds the layer's pixels as a
// trimmed cel in layer pixels; the layer places them on the canvas at (x, y), enlarged by `scale`
// (nearest neighbour). Pure pixel code, so it runs in workers and tests.

import type { Cel, PaintLayer, Pixels } from '../model/types';

export interface Box { x: number; y: number; w: number; h: number }

// Source-over of one RGBA pixel (src[s..s+3]) onto dst[d..d+3].
export function blendPixel(dst: Pixels, d: number, src: ArrayLike<number>, s: number) {
  const a = src[s + 3];
  if (!a) return;
  if (a === 255) {
    dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = 255;
    return;
  }
  const sa = a / 255, da = dst[d + 3] / 255, oa = sa + da * (1 - sa);
  for (let k = 0; k < 3; k++) dst[d + k] = (src[s + k] * sa + dst[d + k] * da * (1 - sa)) / oa;
  dst[d + 3] = oa * 255;
}

// Canvas area covered by a cel (fractional when the layer is scaled).
export function celRect(l: PaintLayer, c: Cel): Box {
  return { x: l.x + c.x * l.scale, y: l.y + c.y * l.scale, w: c.w * l.scale, h: c.h * l.scale };
}

// Layer pixel shown at a canvas pixel (sampled at the pixel centre).
export function toLayer(l: PaintLayer, cx: number, cy: number): { x: number; y: number } {
  return { x: Math.floor((cx + 0.5 - l.x) / l.scale), y: Math.floor((cy + 0.5 - l.y) / l.scale) };
}

// Draws a cel onto canvas-sized RGBA pixels (in place).
export function compositeCel(dst: Pixels, dw: number, dh: number, l: PaintLayer, c: Cel) {
  const r = celRect(l, c);
  const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(dw, Math.ceil(r.x + r.w));
  const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(dh, Math.ceil(r.y + r.h));
  for (let ty = y0; ty < y1; ty++) {
    const sy = Math.floor((ty + 0.5 - l.y) / l.scale) - c.y;
    if (sy < 0 || sy >= c.h) continue;
    for (let tx = x0; tx < x1; tx++) {
      const sx = Math.floor((tx + 0.5 - l.x) / l.scale) - c.x;
      if (sx < 0 || sx >= c.w) continue;
      blendPixel(dst, (ty * dw + tx) * 4, c.data, (sy * c.w + sx) * 4);
    }
  }
}

// Alpha of the layer at a canvas pixel.
export function celAlphaAt(l: PaintLayer, c: Cel, cx: number, cy: number): number {
  const p = toLayer(l, cx, cy);
  const x = p.x - c.x, y = p.y - c.y;
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return 0;
  return c.data[(y * c.w + x) * 4 + 3];
}

// Smallest cel holding the visible pixels of a w×h buffer placed at (x, y); null when empty.
export function trimCel(data: Pixels, w: number, h: number, x: number, y: number): Cel | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++)
      if (data[(py * w + px) * 4 + 3]) {
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        y1 = py;
      }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  if (cw === w && ch === h) return { x, y, w, h, data };
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let py = 0; py < ch; py++) out.set(data.subarray(((y0 + py) * w + x0) * 4, ((y0 + py) * w + x1 + 1) * 4), py * cw * 4);
  return { x: x + x0, y: y + y0, w: cw, h: ch, data: out };
}

// Copies a cel into a larger w×h buffer placed at (x, y) in layer pixels.
export function celInto(c: Cel | undefined, x: number, y: number, w: number, h: number): Pixels {
  const out = new Uint8ClampedArray(w * h * 4);
  if (!c) return out;
  for (let py = 0; py < c.h; py++) {
    const ty = c.y + py - y;
    if (ty < 0 || ty >= h) continue;
    for (let px = 0; px < c.w; px++) {
      const tx = c.x + px - x;
      if (tx < 0 || tx >= w) continue;
      out.set(c.data.subarray((py * c.w + px) * 4, (py * c.w + px) * 4 + 4), (ty * w + tx) * 4);
    }
  }
  return out;
}

// Mirrors a cel around its own centre (the object flips in place).
export function flipCel(c: Cel, horizontal: boolean): Cel {
  const out = new Uint8ClampedArray(c.data.length);
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const tx = horizontal ? c.w - 1 - x : x, ty = horizontal ? y : c.h - 1 - y;
      out.set(c.data.subarray((y * c.w + x) * 4, (y * c.w + x) * 4 + 4), (ty * c.w + tx) * 4);
    }
  return { ...c, data: out };
}

// Takes the pixels inside `rect` (canvas pixels) out of a frame: the cut pixels as a cel in canvas
// coordinates (null when nothing is there) and the frame without them.
export function liftPixels(data: Pixels, w: number, h: number, rect: Box): { cel: Cel | null; rest: Pixels } {
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(w, Math.ceil(rect.x + rect.w)), y1 = Math.min(h, Math.ceil(rect.y + rect.h));
  if (x1 <= x0 || y1 <= y0) return { cel: null, rest: data };
  const cw = x1 - x0, ch = y1 - y0;
  const cut = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) cut.set(data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1) * 4), y * cw * 4);
  const cel = trimCel(cut, cw, ch, x0, y0);
  if (!cel) return { cel: null, rest: data };
  const rest = data.slice();
  for (let y = y0; y < y1; y++) rest.fill(0, (y * w + x0) * 4, (y * w + x1) * 4);
  return { cel, rest };
}
