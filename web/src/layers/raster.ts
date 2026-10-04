// Turns layers into pixels.
//   Stickers: RGBA bitmaps at canvas resolution, baked over every frame (bakeLayers).
//   Clocks:   glyph atlases at screen resolution for the board (widgetsFor).
// Needs OffscreenCanvas (main thread and workers); without it layers are skipped.

import { to565 } from '../color/rgb565';
import { getPreset } from '../model/presets';
import { hexToRgb } from '../model/project';
import type { ClockLayer, Layer, Pixels, Project, StickerLayer } from '../model/types';
import { EMOJI_FONT, fontCss, ICONS } from './catalog';
import { parseFormat } from './clock';
import { buildWidgetBlock, parseWidgetBlock, type GlyphBitmap, type GlyphStyle, type ParsedBlock, type Rect, type TextRasterizer } from './widgets';

const hasCanvas = () => typeof OffscreenCanvas !== 'undefined';

function ctx2d(w: number, h: number) {
  const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  return c.getContext('2d', { willReadFrequently: true })!;
}

export interface Bitmap { w: number; h: number; data: Uint8ClampedArray }

// ---------------------------------------------------------------------------------------------
// Stickers

function trim(b: Bitmap): Bitmap {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      if (b.data[(y * b.w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
  if (x1 < 0) return { w: 1, h: 1, data: new Uint8ClampedArray(4) };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(b.data.subarray(((y0 + y) * b.w + x0) * 4, ((y0 + y) * b.w + x1 + 1) * 4), y * w * 4);
  return { w, h, data: out };
}

// One-pixel dark outline around everything visible (grows the bitmap by 1 on each side).
function outlined(b: Bitmap): Bitmap {
  const w = b.w + 2, h = b.h + 2;
  const out = new Uint8ClampedArray(w * h * 4);
  const alpha = (x: number, y: number) => (x < 0 || y < 0 || x >= b.w || y >= b.h ? 0 : b.data[(y * b.w + x) * 4 + 3]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x - 1, sy = y - 1, o = (y * w + x) * 4;
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near = Math.max(near, alpha(sx + dx, sy + dy));
      const a = alpha(sx, sy) / 255;
      if (a) {
        const i = (sy * b.w + sx) * 4;
        out[o] = b.data[i] * a; out[o + 1] = b.data[i + 1] * a; out[o + 2] = b.data[i + 2] * a;
      }
      out[o + 3] = Math.max(alpha(sx, sy), near);
    }
  return { w, h, data: out };
}

function crispen(b: Bitmap): Bitmap {
  const d = b.data.slice();
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  return { ...b, data: d };
}

function textFont(size: number, css: string, bold: boolean) {
  return `${bold ? 700 : 400} ${size}px ${css}`;
}

function renderSticker(l: StickerLayer): Bitmap {
  const size = Math.max(3, Math.round(l.size));
  const src = l.source;
  let bmp: Bitmap;
  if (src.type === 'icon') {
    const c = ctx2d(size, size);
    const icon = ICONS.find((i) => i.id === src.name) ?? ICONS[0];
    c.scale(size / 100, size / 100);
    c.fillStyle = c.strokeStyle = l.color;
    icon.draw(c);
    bmp = trim({ w: size, h: size, data: c.getImageData(0, 0, size, size).data });
  } else {
    const isEmoji = src.type === 'emoji';
    const font = isEmoji ? `${size}px ${EMOJI_FONT}` : textFont(size, fontCss(src.font), src.bold);
    const text = isEmoji ? src.char : src.text || ' ';
    const probe = ctx2d(1, 1);
    probe.font = font;
    const m = probe.measureText(text);
    const asc = Math.ceil(Math.max(m.actualBoundingBoxAscent, size * 0.8));
    const desc = Math.ceil(Math.max(m.actualBoundingBoxDescent, size * 0.25));
    const w = Math.ceil(Math.max(m.width, m.actualBoundingBoxRight + m.actualBoundingBoxLeft)) + 2;
    const h = asc + desc + 2;
    const c = ctx2d(w, h);
    c.font = font;
    c.fillStyle = l.color;
    c.textBaseline = 'alphabetic';
    c.fillText(text, 1 + Math.max(0, m.actualBoundingBoxLeft), asc + 1);
    bmp = { w, h, data: c.getImageData(0, 0, w, h).data };
    if (isEmoji) bmp = trim(bmp);
  }
  if (l.crisp || (src.type === 'text' && src.font === 'pixel')) bmp = crispen(bmp);
  if (l.outline && src.type !== 'emoji') bmp = outlined(bmp);
  return bmp;
}

const stickerCache = new WeakMap<StickerLayer, Bitmap>();

export function stickerBitmap(l: StickerLayer): Bitmap | null {
  if (!hasCanvas()) return null;
  let b = stickerCache.get(l);
  if (!b) {
    b = renderSticker(l);
    stickerCache.set(l, b);
  }
  return b;
}

export function stickers(p: Project): StickerLayer[] {
  return (p.layers ?? []).filter((l): l is StickerLayer => l.kind === 'sticker');
}

export function clocks(p: Project): ClockLayer[] {
  return (p.layers ?? []).filter((l): l is ClockLayer => l.kind === 'clock' && parseFormat(l.format).length > 0);
}

// Source-over of a bitmap onto RGBA canvas pixels (in place).
export function composite(dst: Pixels, dw: number, dh: number, b: Bitmap, x: number, y: number) {
  for (let sy = 0; sy < b.h; sy++) {
    const ty = y + sy;
    if (ty < 0 || ty >= dh) continue;
    for (let sx = 0; sx < b.w; sx++) {
      const tx = x + sx;
      if (tx < 0 || tx >= dw) continue;
      const s = (sy * b.w + sx) * 4, a = b.data[s + 3];
      if (!a) continue;
      const d = (ty * dw + tx) * 4;
      if (a === 255) {
        dst[d] = b.data[s]; dst[d + 1] = b.data[s + 1]; dst[d + 2] = b.data[s + 2]; dst[d + 3] = 255;
        continue;
      }
      const sa = a / 255, da = dst[d + 3] / 255, oa = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++) dst[d + k] = (b.data[s + k] * sa + dst[d + k] * da * (1 - sa)) / oa;
      dst[d + 3] = oa * 255;
    }
  }
}

const layersKeyCache = new WeakMap<Layer[], string>();
export function stickerKey(p: Project): string {
  const layers = p.layers;
  if (!layers?.length) return '';
  let k = layersKeyCache.get(layers);
  if (k === undefined) {
    k = JSON.stringify(stickers(p));
    layersKeyCache.set(layers, k);
  }
  return k === '[]' ? '' : k;
}

const bakeCache = new WeakMap<Uint8ClampedArray, { key: string; out: Pixels }>();

// Frame pixels with every sticker drawn on top (the original buffer when there are none).
export function bakeLayers(p: Project, data: Pixels): Pixels {
  const key = stickerKey(p);
  if (!key || !hasCanvas()) return data;
  const hit = bakeCache.get(data);
  if (hit && hit.key === key) return hit.out;
  const out = data.slice();
  for (const l of stickers(p)) {
    const b = stickerBitmap(l);
    if (b) composite(out, p.width, p.height, b, Math.round(l.x), Math.round(l.y));
  }
  bakeCache.set(data, { key, out });
  return out;
}

export function layersKey(p: Project): string {
  return p.layers?.length ? JSON.stringify(p.layers) : '';
}

// ---------------------------------------------------------------------------------------------
// Clock glyphs

interface LineMetrics { asc: number; h: number; k: number; font: string }
const lineCache = new Map<string, LineMetrics>();

// Pixel style: draw small without anti-aliasing, then enlarge k× (chunky, readable on any panel).
function metrics(style: GlyphStyle): LineMetrics {
  const key = `${style.font}|${style.size}|${style.bold}`;
  let m = lineCache.get(key);
  if (!m) {
    const pixel = style.font === 'pixel';
    const k = pixel ? Math.max(2, Math.round(style.size / 9)) : 1;
    const font = textFont(Math.max(4, Math.round(style.size / k)), fontCss(style.font as never), style.bold);
    const c = ctx2d(1, 1);
    c.font = font;
    const t = c.measureText('0123456789:ปีที่ฟ้าญู่ฎฐAgjÝ');
    const asc = Math.ceil(t.actualBoundingBoxAscent) + 1;
    m = { asc, h: asc + Math.ceil(t.actualBoundingBoxDescent) + 1, k, font };
    lineCache.set(key, m);
  }
  return m;
}

export const canvasRasterizer: TextRasterizer = {
  measure(text, style) {
    const m = metrics(style);
    const c = ctx2d(1, 1);
    c.font = m.font;
    return Math.ceil(c.measureText(text).width) * m.k;
  },
  draw(text, style, width): GlyphBitmap {
    const m = metrics(style);
    const sw = Math.max(1, Math.ceil(width / m.k)), sh = m.h;
    const c = ctx2d(sw, sh);
    c.font = m.font;
    c.fillStyle = '#fff';
    c.textBaseline = 'alphabetic';
    c.textAlign = 'center';
    c.fillText(text, sw / 2, m.asc);
    const src = c.getImageData(0, 0, sw, sh).data;
    const w = Math.max(1, width), h = sh * m.k;
    const alpha = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const a = src[((y / m.k | 0) * sw + Math.min(sw - 1, x / m.k | 0)) * 4 + 3];
        alpha[y * w + x] = m.k > 1 ? (a >= 128 ? 15 : 0) : Math.round(a / 17);
      }
    return { w, h, alpha };
  },
};

export interface ProjectWidgets {
  block: Uint8Array;
  parsed: ParsedBlock;
  layers: ClockLayer[]; // same order as parsed.widgets
  boxes: Rect[];
}

const widgetCache = new Map<string, ProjectWidgets | null>();

export function clockColor565(color: string, mono: boolean): number {
  const [r, g, b] = hexToRgb(color);
  return mono ? ((r * 77 + g * 150 + b * 29) >> 8 >= 128 ? 0xffff : 0) : to565(r, g, b);
}

// Widget block for the project's clock layers (null when there are none). Throws when too large.
export function widgetsFor(p: Project): ProjectWidgets | null {
  const layers = clocks(p);
  if (!layers.length || !hasCanvas()) return null;
  const mono = getPreset(p.presetId).color === 'mono';
  const key = JSON.stringify([mono, layers]);
  if (widgetCache.has(key)) return widgetCache.get(key)!;
  const built = buildWidgetBlock(layers.map((l) => ({
    x: l.x, y: l.y, align: l.align === 'left' ? 0 : l.align === 'center' ? 1 : 2,
    color565: clockColor565(l.color, mono), format: l.format,
    style: { size: Math.max(6, Math.round(l.size)), font: l.font, bold: l.bold },
  })), canvasRasterizer);
  const result = built && { block: built.block, parsed: parseWidgetBlock(built.block), layers, boxes: built.boxes };
  if (widgetCache.size > 24) widgetCache.clear();
  widgetCache.set(key, result);
  return result;
}
