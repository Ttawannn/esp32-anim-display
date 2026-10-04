import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeDpa, encodeDpa, FLAG_WIDGETS } from '../codec/dpa';
import { createProject, newFrame } from '../model/project';
import { formatClock, parseFormat, type ClockTime } from './clock';
import {
  blend565, buildWidgetBlock, drawWidgets565, drawWidgetsMono, layoutWidget, parseWidgetBlock, widgetCanvasRect,
  type TextRasterizer, type WidgetInput,
} from './widgets';

// Deterministic stand-in for canvas text rendering (node has no canvas).
export const fakeRasterizer: TextRasterizer = {
  measure: (text, s) => [...text].length * Math.ceil(s.size / 2),
  draw: (text, s, width) => {
    const h = s.size + 2, alpha = new Uint8Array(width * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < width; x++) alpha[y * width + x] = (x * 7 + y * 3 + text.charCodeAt(0)) % 16;
    return { w: width, h, alpha };
  },
};

const TIME: ClockTime = { valid: true, year: 2026, month: 10, day: 4, hour: 9, minute: 5, second: 7, wday: 0 };
const NO_TIME: ClockTime = { ...TIME, valid: false };

describe('clock formats', () => {
  it('parses tokens, literals and names', () => {
    expect(formatClock('HH:mm:ss', TIME)).toBe('09:05:07');
    expect(formatClock('h:mm A', { ...TIME, hour: 21 })).toBe('9:05 PM');
    expect(formatClock('d MMM BBBB', TIME)).toBe('4 ต.ค. 2569');
    expect(formatClock('dddd[ที่] d', TIME)).toBe('อาทิตย์ที่ 4');
    expect(formatClock('Lddd d MMM yy', TIME)).toBe('Sun 4 Oct 26');
    expect(formatClock('HH:mm', NO_TIME)).toBe('--:--');
    expect(parseFormat('[Time] HH').map((p) => p.kind)).toEqual(['text', 'number']);
  });
});

const INPUTS: WidgetInput[] = [
  { x: 20, y: 30, color565: 0xffe0, align: 1, format: 'HH:mm:ss', style: { size: 12, font: 'sans', bold: true } },
  { x: 4, y: 60, color565: 0x07ff, align: 0, format: 'ddd d MMM BBBB', style: { size: 8, font: 'mono', bold: false } },
  { x: 10, y: 90, color565: 0xf800, align: 2, format: 'h A', style: { size: 6, font: 'sans', bold: false } },
];

describe('widget block', () => {
  const built = buildWidgetBlock(INPUTS, fakeRasterizer)!;
  const b = parseWidgetBlock(built.block);

  it('round-trips and lays out the current time', () => {
    expect(b.widgets).toHaveLength(3);
    expect(b.widgets[0].box).toEqual(built.boxes[0]);
    const { items, width } = layoutWidget(b, b.widgets[0], TIME);
    expect(items.map(([g]) => g - b.widgets[0].digits)).toEqual([0, 9, items[2][0] - b.widgets[0].digits, 0, 5, items[5][0] - b.widgets[0].digits, 0, 7]);
    expect(width).toBe(b.widgets[0].box.w);
    // Unknown time: dashes, names left out.
    expect(layoutWidget(b, b.widgets[0], NO_TIME).items.filter(([g]) => g === b.widgets[0].digits + 10)).toHaveLength(6);
  });

  it('dedupes glyph runs and stays small', () => {
    expect(built.block.length).toBeLessThan(8000);
    expect(new Set(b.glyphs.map((g) => g.offset)).size).toBe(b.glyphs.length);
  });

  it('blends like the firmware', () => {
    expect(blend565(0x0000, 0xffff, 15)).toBe(0xffff);
    expect(blend565(0x0000, 0xffff, 0)).toBe(0);
    expect(blend565(0x0000, 0xf800, 8)).toBe(((31 * 8 + 7) / 15 | 0) << 11);
  });

  it('forces every frame to redraw the area under the clock', async () => {
    const p = createProject({ presetId: 'st7789_240x240', width: 60, height: 60, scale: 4 });
    const a = new Uint8ClampedArray(60 * 60 * 4).fill(255);
    p.frames = [newFrame(60, 60, 100, a), newFrame(60, 60, 100, a.slice())]; // second frame unchanged
    const { bytes } = await encodeDpa(p, undefined, undefined, built);
    const v = new DataView(bytes.buffer);
    expect(v.getUint16(26, true)).toBe(FLAG_WIDGETS);
    const table = v.getUint32(28, true);
    expect(table - 32 - v.getUint16(22, true) * 2).toBe(built.block.length);
    const off = v.getUint32(table + 12, true);
    const keep = widgetCanvasRect(built.boxes, p)!;
    expect([v.getUint16(off, true), v.getUint16(off + 2, true), v.getUint16(off + 4, true), v.getUint16(off + 6, true)])
      .toEqual([keep.x, keep.y, keep.w, keep.h]);
    expect(decodeDpa(bytes).frames).toHaveLength(2);
  });
});

// Shared vectors for firmware/test/native/widgets_test.cpp: the .dpa plus the expected screen after
// compositing the widgets over a flat colour for TIME and for an unknown time.
describe('widget test vectors', () => {
  const OUT = join(__dirname, '..', '..', '..', 'shared', 'test-vectors');
  mkdirSync(OUT, { recursive: true });

  it('writes clock_rgb', async () => {
    const p = createProject({ presetId: 'st7789_240x240', width: 30, height: 30, scale: 4, background: '#000000' });
    p.offsetX = 0; p.offsetY = 0; // canvas covers x/y 0..119: clips part of the widgets
    p.frames = [newFrame(30, 30, 100, new Uint8ClampedArray(30 * 30 * 4).fill(200))];
    const built = buildWidgetBlock(INPUTS, fakeRasterizer)!;
    const { bytes } = await encodeDpa(p, undefined, undefined, built);
    const b = parseWidgetBlock(built.block);
    const clip = { x: 0, y: 0, w: 120, h: 120 };
    const out = new Uint16Array(240 * 240 * 2);
    for (const [k, t] of [TIME, NO_TIME].entries()) {
      const screen = out.subarray(k * 240 * 240, (k + 1) * 240 * 240).fill(0x1234);
      drawWidgets565(b, t, screen, 240, clip);
    }
    writeFileSync(join(OUT, 'clock_rgb.dpa'), bytes);
    writeFileSync(join(OUT, 'clock_rgb.widgets'), new Uint8Array(out.buffer));
    expect(out.some((v) => v !== 0x1234)).toBe(true);
  });

  it('writes clock_mono', async () => {
    const p = createProject({ presetId: 'ssd1306_128x64', width: 128, height: 64, scale: 1 });
    p.frames = [newFrame(128, 64, 100)];
    const inputs = INPUTS.map((w, i) => ({ ...w, y: 2 + i * 20, color565: i === 2 ? 0 : 0xffff }));
    const built = buildWidgetBlock(inputs, fakeRasterizer)!;
    const { bytes } = await encodeDpa(p, undefined, undefined, built);
    const b = parseWidgetBlock(built.block);
    const out = new Uint8Array(128 * 64 * 2);
    for (const [k, t] of [TIME, NO_TIME].entries()) {
      const screen = out.subarray(k * 128 * 64, (k + 1) * 128 * 64);
      for (let i = 0; i < screen.length; i++) screen[i] = (i >> 3) & 1; // stripes, so "off" pixels show too
      drawWidgetsMono(b, t, screen, 128, { x: 0, y: 0, w: 128, h: 64 });
    }
    writeFileSync(join(OUT, 'clock_mono.dpa'), bytes);
    writeFileSync(join(OUT, 'clock_mono.widgets'), out);
    expect(out.length).toBe(128 * 64 * 2);
  });
});
