// Small pixel toolkit for generated animations (pure JS: runs in tests without a canvas).

import { hexToRgb } from '../model/project';
import type { Pixels } from '../model/types';

export type RGB = [number, number, number];

export const rgb = (hex: string): RGB => hexToRgb(hex);

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function hsv(h: number, s: number, v: number): RGB {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [r * 255, g * 255, b * 255];
}

// Deterministic random numbers, so a template always generates the same animation.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Img {
  readonly d: Pixels;
  constructor(readonly w: number, readonly h: number, fill?: RGB) {
    this.d = new Uint8ClampedArray(w * h * 4);
    if (fill) this.fill(fill);
  }

  fill(c: RGB, a = 255) {
    for (let i = 0; i < this.d.length; i += 4) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; }
    return this;
  }

  // Blend colour c with coverage a (0..1) over the pixel ("source over").
  plot(x: number, y: number, c: RGB, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    if (a >= 1) {
      this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
      return;
    }
    const da = this.d[i + 3] / 255, oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * a + this.d[i + k] * da * (1 - a)) / oa;
    this.d[i + 3] = oa * 255;
  }

  // Additive glow (fireworks, stars).
  add(x: number, y: number, c: RGB, a = 1) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] += c[0] * a; this.d[i + 1] += c[1] * a; this.d[i + 2] += c[2] * a; this.d[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB, a = 1) {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.plot(xx, yy, c, a);
  }

  // Filled circle; `smooth` anti-aliases the edge (good at scale 1-2, keep off for pixel art).
  disc(cx: number, cy: number, r: number, c: RGB, smooth = false, a = 1) {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1), y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cov = smooth ? Math.max(0, Math.min(1, r - d + 0.5)) : d <= r ? 1 : 0;
        if (cov > 0) this.plot(x, y, c, cov * a);
      }
  }

  ring(cx: number, cy: number, r: number, width: number, c: RGB, smooth = false, from = 0, to = Math.PI * 2) {
    const R = r + width / 2 + 1;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        let ang = Math.atan2(dy, dx);
        if (ang < from) ang += Math.PI * 2;
        if (ang > to) continue;
        const dist = Math.abs(Math.hypot(dx, dy) - r);
        const cov = smooth ? Math.max(0, Math.min(1, width / 2 - dist + 0.5)) : dist <= width / 2 ? 1 : 0;
        if (cov > 0) this.plot(x, y, c, cov);
      }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, width = 1, a = 1) {
    const len = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= len; i++) {
      const t = i / len, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (width <= 1) this.plot(Math.round(x), Math.round(y), c, a);
      else this.disc(x, y, width / 2, c, false, a);
    }
  }

  // Inside test over pixel centres (for shapes given by an equation).
  shape(inside: (x: number, y: number) => boolean, c: RGB, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, Math.ceil(y1)); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, Math.ceil(x1)); x++) if (inside(x + 0.5, y + 0.5)) this.plot(x, y, c);
  }
}

// Round displays: keep the main subject inside the visible circle.
export function safeRadius(w: number, h: number, round: boolean) {
  return (Math.min(w, h) / 2) * (round ? 0.82 : 0.95);
}
