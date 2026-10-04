// Live clock widgets inside a .dpa file (docs/dpa-format.md, "Widget block").
//
// The editor pre-renders every glyph a clock can need (digits, literal text, weekday / month
// names) as 4-bit alpha bitmaps; the board only picks glyphs for the current time and blends them
// over the frame while it is being sent to the panel. This file holds the writer, a reader and
// the reference renderer that firmware/src/player/widgets.h must match pixel for pixel.

import { NAME_FIELDS, NUMBER_FIELDS, nameIndex, numberValue, parseFormat, type ClockTime } from './clock';

export const WIDGET_MAGIC = 'WDG1';
export const MAX_WIDGET_BLOCK = 48 * 1024;
export const MAX_WIDGETS = 8;
const BLOCK_HEAD = 12;
const GLYPH_ENTRY = 8;
const WIDGET_HEAD = 16;
const PART_SIZE = 4;

export const PART_TEXT = 0;
export const PART_NUMBER = 1;
export const PART_NAME = 2;

export interface Rect { x: number; y: number; w: number; h: number }

export interface GlyphBitmap {
  w: number;
  h: number;
  alpha: Uint8Array; // w*h values 0..15
}

export interface GlyphStyle {
  size: number;
  font: string;
  bold: boolean;
}

// Renders text for one widget style. All glyphs of a style share the same height.
export interface TextRasterizer {
  measure(text: string, style: GlyphStyle): number;
  draw(text: string, style: GlyphStyle, width: number): GlyphBitmap; // centred in `width`
}

export interface WidgetInput {
  x: number; // box top-left on screen
  y: number;
  color565: number; // MONO: 0 = off, anything else = on
  align: 0 | 1 | 2; // left, center, right
  format: string;
  style: GlyphStyle;
}

export interface WidgetBlock {
  block: Uint8Array;
  boxes: Rect[]; // screen boxes; every frame redraws the canvas area under them
}

interface PartRecord { kind: number; field: number; glyph: number }

export function buildWidgetBlock(inputs: WidgetInput[], r: TextRasterizer): WidgetBlock | null {
  if (!inputs.length) return null;
  if (inputs.length > MAX_WIDGETS) throw new Error(`ใส่นาฬิกา/วันที่ได้สูงสุด ${MAX_WIDGETS} อัน`);
  const glyphs: GlyphBitmap[] = [];
  const glyphIds = new Map<string, number>();
  const glyph = (text: string, style: GlyphStyle, width: number) => {
    const key = `${style.font}|${style.size}|${style.bold}|${width}|${text}`;
    let id = glyphIds.get(key);
    if (id === undefined) {
      id = glyphs.length;
      glyphs.push(r.draw(text, style, width));
      glyphIds.set(key, id);
    }
    return id;
  };

  // Names must be consecutive glyphs (the board indexes them), so a list is stored as one run.
  const runs = new Map<string, number>();
  const nameRun = (names: string[], style: GlyphStyle, cell = 0) => {
    const key = `${style.font}|${style.size}|${style.bold}|${cell}|${names.join('|')}`;
    let first = runs.get(key);
    if (first === undefined) {
      first = glyphs.length;
      for (const n of names) glyphs.push(r.draw(n, style, cell || Math.ceil(r.measure(n, style))));
      runs.set(key, first);
    }
    return first;
  };

  const widgets: { box: Rect; color: number; align: number; digits: number; parts: PartRecord[] }[] = [];
  for (const w of inputs) {
    const parts = parseFormat(w.format);
    if (!parts.length) continue;
    // Digits share one width so the text does not jitter as the time changes.
    const cell = Math.ceil(Math.max(...'0123456789'.split('').map((c) => r.measure(c, w.style))));
    const digits = nameRun('0123456789-'.split(''), w.style, cell);
    let width = 0;
    const records: PartRecord[] = parts.map((p) => {
      if (p.kind === 'text') {
        const id = glyph(p.text, w.style, Math.ceil(r.measure(p.text, w.style)));
        width += glyphs[id].w;
        return { kind: PART_TEXT, field: 0, glyph: id };
      }
      if (p.kind === 'number') {
        width += cell * (p.field === 'year' || p.field === 'yearBE' ? 4 : Math.max(2, p.digits));
        return { kind: PART_NUMBER, field: NUMBER_FIELDS.indexOf(p.field), glyph: p.digits };
      }
      const first = nameRun(p.names, w.style);
      width += Math.max(...p.names.map((_, k) => glyphs[first + k].w));
      return { kind: PART_NAME, field: NAME_FIELDS.indexOf(p.field), glyph: first };
    });
    if (records.length > 32) throw new Error('รูปแบบวันที่/เวลายาวเกินไป');
    const height = glyphs[digits].h;
    widgets.push({ box: { x: Math.round(w.x), y: Math.round(w.y), w: Math.max(1, width), h: height }, color: w.color565, align: w.align, digits, parts: records });
  }
  if (!widgets.length) return null;
  if (glyphs.length > 1024) throw new Error('นาฬิกา/วันที่มีตัวอักษรมากเกินไป');

  const glyphBytes = glyphs.map((g) => Math.ceil(g.w / 2) * g.h);
  const widgetsSize = widgets.reduce((s, w) => s + WIDGET_HEAD + w.parts.length * PART_SIZE, 0);
  const dataStart = BLOCK_HEAD + glyphs.length * GLYPH_ENTRY + widgetsSize;
  const total = dataStart + glyphBytes.reduce((a, b) => a + b, 0);
  if (total > MAX_WIDGET_BLOCK) {
    throw new Error(`นาฬิกา/วันที่ใช้พื้นที่ ${Math.ceil(total / 1024)} KB เกิน ${MAX_WIDGET_BLOCK / 1024} KB — ลดขนาดตัวอักษรหรือใช้ชื่อเดือนแบบย่อ`);
  }

  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  out.set([...WIDGET_MAGIC].map((c) => c.charCodeAt(0)), 0);
  v.setUint32(4, total, true);
  v.setUint8(8, widgets.length);
  v.setUint16(10, glyphs.length, true);
  let data = dataStart;
  glyphs.forEach((g, i) => {
    const e = BLOCK_HEAD + i * GLYPH_ENTRY;
    v.setUint16(e, g.w, true);
    v.setUint16(e + 2, g.h, true);
    v.setUint32(e + 4, data, true);
    const stride = Math.ceil(g.w / 2);
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const a = g.alpha[y * g.w + x] & 15;
        out[data + y * stride + (x >> 1)] |= x & 1 ? a : a << 4;
      }
    data += glyphBytes[i];
  });
  let o = BLOCK_HEAD + glyphs.length * GLYPH_ENTRY;
  for (const w of widgets) {
    v.setInt16(o, w.box.x, true);
    v.setInt16(o + 2, w.box.y, true);
    v.setUint16(o + 4, w.box.w, true);
    v.setUint16(o + 6, w.box.h, true);
    v.setUint16(o + 8, w.color, true);
    v.setUint8(o + 10, w.align);
    v.setUint8(o + 11, w.parts.length);
    v.setUint16(o + 12, w.digits, true);
    o += WIDGET_HEAD;
    for (const p of w.parts) {
      v.setUint8(o, p.kind);
      v.setUint8(o + 1, p.field);
      v.setUint16(o + 2, p.glyph, true);
      o += PART_SIZE;
    }
  }
  return { block: out, boxes: widgets.map((w) => w.box) };
}

// ---------------------------------------------------------------------------------------------
// Reader + reference renderer

export interface ParsedWidget { box: Rect; color: number; align: number; digits: number; parts: PartRecord[] }
export interface ParsedBlock {
  bytes: Uint8Array;
  glyphs: { w: number; h: number; offset: number }[];
  widgets: ParsedWidget[];
}

export function parseWidgetBlock(bytes: Uint8Array): ParsedBlock {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== WIDGET_MAGIC) throw new Error('not a widget block');
  const count = v.getUint8(8), glyphCount = v.getUint16(10, true);
  const glyphs = Array.from({ length: glyphCount }, (_, i) => {
    const e = BLOCK_HEAD + i * GLYPH_ENTRY;
    return { w: v.getUint16(e, true), h: v.getUint16(e + 2, true), offset: v.getUint32(e + 4, true) };
  });
  const widgets: ParsedWidget[] = [];
  let o = BLOCK_HEAD + glyphCount * GLYPH_ENTRY;
  for (let i = 0; i < count; i++) {
    const n = v.getUint8(o + 11);
    const w: ParsedWidget = {
      box: { x: v.getInt16(o, true), y: v.getInt16(o + 2, true), w: v.getUint16(o + 4, true), h: v.getUint16(o + 6, true) },
      color: v.getUint16(o + 8, true), align: v.getUint8(o + 10), digits: v.getUint16(o + 12, true), parts: [],
    };
    o += WIDGET_HEAD;
    for (let k = 0; k < n; k++, o += PART_SIZE) w.parts.push({ kind: v.getUint8(o), field: v.getUint8(o + 1), glyph: v.getUint16(o + 2, true) });
    widgets.push(w);
  }
  return { bytes, glyphs, widgets };
}

// Glyphs to draw for the current time: [glyph index, x offset from the text start], total width.
export function layoutWidget(b: ParsedBlock, w: ParsedWidget, t: ClockTime): { items: [number, number][]; width: number } {
  const items: [number, number][] = [];
  let x = 0;
  const put = (g: number) => {
    items.push([g, x]);
    x += b.glyphs[g].w;
  };
  for (const p of w.parts) {
    if (p.kind === PART_TEXT) put(p.glyph);
    else if (p.kind === PART_NUMBER) {
      const digits = p.glyph;
      if (!t.valid) for (let k = 0; k < digits; k++) put(w.digits + 10);
      else for (const c of String(numberValue(NUMBER_FIELDS[p.field], t)).padStart(digits, '0')) put(w.digits + c.charCodeAt(0) - 48);
    } else if (t.valid) {
      put(p.glyph + nameIndex(NAME_FIELDS[p.field], t));
    }
  }
  return { items, width: x };
}

// Same integer math as the firmware: a = 0..15.
export function blend565(d: number, c: number, a: number): number {
  if (a >= 15) return c;
  const ia = 15 - a;
  const r = (((c >> 11) & 31) * a + ((d >> 11) & 31) * ia + 7) / 15 | 0;
  const g = (((c >> 5) & 63) * a + ((d >> 5) & 63) * ia + 7) / 15 | 0;
  const bl = ((c & 31) * a + (d & 31) * ia + 7) / 15 | 0;
  return (r << 11) | (g << 5) | bl;
}

export interface WidgetTarget {
  clip: Rect; // where drawing is allowed (the animation's canvas area on the panel)
  dx: number; // added to widget boxes (files made for another screen size are centred)
  dy: number;
  pixel(x: number, y: number, alpha: number, color: number): void; // alpha 1..15
}

export function drawWidgets(b: ParsedBlock, t: ClockTime, target: WidgetTarget) {
  for (const w of b.widgets) {
    const { items, width } = layoutWidget(b, w, t);
    const bx = w.box.x + target.dx, by = w.box.y + target.dy;
    const start = w.align === 0 ? bx : w.align === 1 ? bx + Math.trunc((w.box.w - width) / 2) : bx + w.box.w - width;
    const x0 = Math.max(bx, target.clip.x), x1 = Math.min(bx + w.box.w, target.clip.x + target.clip.w);
    const y0 = Math.max(by, target.clip.y), y1 = Math.min(by + w.box.h, target.clip.y + target.clip.h);
    if (x0 >= x1 || y0 >= y1) continue;
    for (const [gi, gx] of items) {
      const g = b.glyphs[gi];
      const stride = (g.w + 1) >> 1;
      for (let row = 0; row < g.h; row++) {
        const sy = by + row;
        if (sy < y0 || sy >= y1) continue;
        for (let col = 0; col < g.w; col++) {
          const sx = start + gx + col;
          if (sx < x0 || sx >= x1) continue;
          const byte = b.bytes[g.offset + row * stride + (col >> 1)];
          const a = col & 1 ? byte & 15 : byte >> 4;
          if (a) target.pixel(sx, sy, a, w.color);
        }
      }
    }
  }
}

// RGB565 screen buffer (tests, previews): blends like the firmware's colour path.
export function drawWidgets565(b: ParsedBlock, t: ClockTime, screen: Uint16Array, sw: number, clip: Rect, dx = 0, dy = 0) {
  drawWidgets(b, t, { clip, dx, dy, pixel: (x, y, a, c) => { screen[y * sw + x] = blend565(screen[y * sw + x], c, a); } });
}

// 1-bit screen (one byte per pixel, tests / previews): alpha >= 8 sets the pixel to the colour.
export function drawWidgetsMono(b: ParsedBlock, t: ClockTime, bits: Uint8Array, sw: number, clip: Rect, dx = 0, dy = 0) {
  drawWidgets(b, t, { clip, dx, dy, pixel: (x, y, a, c) => { if (a >= 8) bits[y * sw + x] = c ? 1 : 0; } });
}

// Canvas-coordinate rect every frame must redraw so the board can restore what is under a clock.
export function widgetCanvasRect(boxes: Rect[], p: { width: number; height: number; scale: number; offsetX: number; offsetY: number }): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, Math.floor((b.x - p.offsetX) / p.scale));
    y0 = Math.min(y0, Math.floor((b.y - p.offsetY) / p.scale));
    x1 = Math.max(x1, Math.ceil((b.x + b.w - p.offsetX) / p.scale));
    y1 = Math.max(y1, Math.ceil((b.y + b.h - p.offsetY) / p.scale));
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(p.width, x1); y1 = Math.min(p.height, y1);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
