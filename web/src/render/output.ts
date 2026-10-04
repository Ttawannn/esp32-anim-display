// Turns editor frames (RGBA) into what the panel will show: color adjustments, RGB565 or 1-bit
// conversion and optional color reduction. Results are cached per frame buffer.

import { adjustTo565, adjustToLuma } from '../color/adjust';
import { toMono } from '../color/mono';
import { quantize, type Quantized } from '../color/quantize';
import { bakeLayers, stickerKey } from '../layers/raster';
import { getPreset } from '../model/presets';
import { hexToRgb } from '../model/project';
import type { Frame, Project } from '../model/types';

export type OutFrame = { kind: 'rgb565'; px: Uint16Array } | { kind: 'mono'; bits: Uint8Array };

export function isMono(p: Project): boolean {
  return getPreset(p.presetId).color === 'mono';
}

function processKey(p: Project): string {
  const a = p.adjust;
  const base = isMono(p)
    ? `m|${a.brightness}|${a.contrast}|${a.invert}|${a.threshold}|${a.dither}|${p.background}|${p.width}`
    : `c|${a.brightness}|${a.contrast}|${a.saturation}|${a.hue}|${a.invert}|${p.background}`;
  return base + '|' + stickerKey(p);
}

const frameCache = new WeakMap<Uint8ClampedArray, { key: string; out: OutFrame }>();

// Adjusted frame without color reduction.
export function processFrame(p: Project, f: Frame): OutFrame {
  const key = processKey(p);
  const hit = frameCache.get(f.data);
  if (hit && hit.key === key) return hit.out;
  const bg = hexToRgb(p.background);
  const data = bakeLayers(p, f.data); // stickers on top of the drawing
  const out: OutFrame = isMono(p)
    ? { kind: 'mono', bits: toMono(adjustToLuma(data, p.adjust, bg), p.width, p.height, p.adjust.threshold, p.adjust.dither) }
    : { kind: 'rgb565', px: adjustTo565(data, p.adjust, bg) };
  frameCache.set(f.data, { key, out });
  return out;
}

// Color reduction across the whole animation (shared palette), cached until frames or settings change.
let quantCache: { key: string; frames: Uint8ClampedArray[]; q: Quantized } | null = null;

export function projectQuantization(p: Project, maxColors: number): Quantized {
  const key = processKey(p) + '|' + maxColors;
  if (
    quantCache &&
    quantCache.key === key &&
    quantCache.frames.length === p.frames.length &&
    quantCache.frames.every((d, i) => d === p.frames[i].data)
  ) {
    return quantCache.q;
  }
  const px = p.frames.map((f) => (processFrame(p, f) as { px: Uint16Array }).px);
  const q = quantize(px, maxColors);
  quantCache = { key, frames: p.frames.map((f) => f.data), q };
  return q;
}

// Frame as the panel will show it, including the "colors" limit.
export function outputFrame(p: Project, f: Frame): OutFrame {
  const out = processFrame(p, f);
  if (out.kind === 'mono' || p.adjust.colors === 0) return out;
  const q = projectQuantization(p, p.adjust.colors);
  const px = new Uint16Array(out.px.length);
  for (let i = 0; i < px.length; i++) px[i] = q.palette[q.map[out.px[i]]];
  return { kind: 'rgb565', px };
}
