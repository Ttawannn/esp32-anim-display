// ASCII art effect: the finished picture is cut into character cells, and each cell becomes the
// character whose ink density matches the cell's brightness. Runs in render/output.ts after the
// color adjustments, so the preview, the encoder and the import dialogs all see the same result,
// and the board just plays ordinary frames.

import { luma } from '../color/adjust';
import { to565 } from '../color/rgb565';
import { hexToRgb } from '../model/project';
import type { AsciiCharset, AsciiEffect, AsciiSize } from '../model/types';
import { FONT, inkOf, SMALL_FONT, type BitmapFont } from './font';

type RGB = [number, number, number];

export const CHARSETS: { id: AsciiCharset; label: string; chars: string }[] = [
  { id: 'classic', label: 'Classic', chars: ' .:-=+*#%@' },
  { id: 'detailed', label: 'Detailed', chars: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$' },
  { id: 'blocks', label: 'Blocks', chars: ' ░▒▓█' },
  { id: 'binary', label: 'Binary', chars: ' 01' },
];

export const SIZES: { id: AsciiSize; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

export interface Ramp {
  chars: string[];
  glyphs: Uint8Array[];
}

const ramps = new Map<string, Ramp>();

// The characters of a set that the font can draw, sorted from sparse to dense by lit pixels.
export function rampFor(font: BitmapFont, charset: AsciiCharset): Ramp {
  const key = `${font.cellW}|${charset}`;
  let r = ramps.get(key);
  if (!r) {
    const set = CHARSETS.find((c) => c.id === charset) ?? CHARSETS[0];
    const chars = [...new Set(set.chars)].filter((c) => font.glyphs.has(c));
    chars.sort((a, b) => inkOf(font.glyphs.get(a)!) - inkOf(font.glyphs.get(b)!));
    r = { chars, glyphs: chars.map((c) => font.glyphs.get(c)!) };
    ramps.set(key, r);
  }
  return r;
}

export interface Grid {
  font: BitmapFont;
  scale: number; // canvas pixels per font pixel
  cellW: number; // canvas pixels
  cellH: number;
  cols: number;
  rows: number;
  ox: number; // the grid is centred; leftover pixels stay background
  oy: number;
}

export function asciiGrid(w: number, h: number, size: AsciiSize): Grid {
  const font = size === 'small' ? SMALL_FONT : FONT;
  const scale = size === 'large' ? 2 : 1;
  const cellW = font.cellW * scale, cellH = font.cellH * scale;
  const cols = Math.max(1, Math.floor(w / cellW)), rows = Math.max(1, Math.floor(h / cellH));
  return {
    font, scale, cellW, cellH, cols, rows,
    ox: Math.max(0, Math.floor((w - cols * cellW) / 2)),
    oy: Math.max(0, Math.floor((h - rows * cellH) / 2)),
  };
}

// Visits every cell with its pixel bounds (clipped to the canvas).
function eachCell(w: number, h: number, g: Grid, fn: (x0: number, y0: number, x1: number, y1: number) => void) {
  for (let row = 0; row < g.rows; row++)
    for (let col = 0; col < g.cols; col++) {
      const x0 = g.ox + col * g.cellW, y0 = g.oy + row * g.cellH;
      fn(x0, y0, Math.min(w, x0 + g.cellW), Math.min(h, y0 + g.cellH));
    }
}

function paintGlyph(g: Grid, glyph: Uint8Array, x0: number, y0: number, x1: number, y1: number, w: number, set: (i: number) => void) {
  const fw = g.font.cellW, s = g.scale;
  for (let y = y0; y < y1; y++) {
    const row = (((y - y0) / s) | 0) * fw;
    for (let x = x0; x < x1; x++) if (glyph[row + (((x - x0) / s) | 0)]) set(y * w + x);
  }
}

const pick = (ramp: Ramp, level: number) => ramp.glyphs[Math.min(ramp.glyphs.length - 1, (level * ramp.glyphs.length) >> 8)];

// Color panels. `rgba` is the adjusted, opaque picture; returns RGB565 pixels.
export function asciiTo565(rgba: Uint8ClampedArray, w: number, h: number, e: AsciiEffect, bg: RGB): Uint16Array {
  const g = asciiGrid(w, h, e.size), ramp = rampFor(g.font, e.charset);
  const out = new Uint16Array(w * h).fill(to565(bg[0], bg[1], bg[2]));
  const ink = hexToRgb(e.ink);
  // Light characters on a dark background: bright cells get dense characters. Otherwise the
  // other way round, so a white background shows dark areas as dense ink.
  const lightOnDark = e.color === 'solid' ? luma(ink[0], ink[1], ink[2]) >= luma(bg[0], bg[1], bg[2]) : luma(bg[0], bg[1], bg[2]) < 128;
  const solid = to565(ink[0], ink[1], ink[2]);
  eachCell(w, h, g, (x0, y0, x1, y1) => {
    let r = 0, gr = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0, i = (y * w + x0) * 4; x < x1; x++, i += 4) { r += rgba[i]; gr += rgba[i + 1]; b += rgba[i + 2]; n++; }
    if (!n) return;
    r /= n; gr /= n; b /= n;
    const y = luma(r, gr, b);
    const glyph = pick(ramp, lightOnDark ? y : 255 - y);
    let c = solid;
    if (e.color === 'image') {
      // Density already shows brightness, so on dark backgrounds the color is shown at full strength.
      const k = lightOnDark ? 255 / Math.max(1, r, gr, b) : 1;
      c = to565(Math.min(255, r * k), Math.min(255, gr * k), Math.min(255, b * k));
    }
    paintGlyph(g, glyph, x0, y0, x1, y1, w, (i) => { out[i] = c; });
  });
  return out;
}

// 1-bit panels. `gray` is the adjusted brightness; returns 1 = lit, so bright cells get dense characters.
export function asciiToMono(gray: Uint8Array, w: number, h: number, e: AsciiEffect): Uint8Array {
  const g = asciiGrid(w, h, e.size), ramp = rampFor(g.font, e.charset);
  const out = new Uint8Array(w * h);
  eachCell(w, h, g, (x0, y0, x1, y1) => {
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += gray[y * w + x]; n++; }
    if (n) paintGlyph(g, pick(ramp, sum / n), x0, y0, x1, y1, w, (i) => { out[i] = 1; });
  });
  return out;
}
