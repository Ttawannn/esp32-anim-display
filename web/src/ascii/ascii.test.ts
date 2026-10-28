import { describe, expect, it } from 'vitest';
import { encodeDpa } from '../codec/dpa';
import { to565 } from '../color/rgb565';
import { atFullResolution, createProject, newFrame } from '../model/project';
import type { AsciiEffect, Layer, Project } from '../model/types';
import { processFrame } from '../render/output';
import { TEMPLATES, templateProject } from '../templates/gallery';
import { asciiGrid, asciiTo565, asciiToMono, CHARSETS, rampFor } from './ascii';
import { FONT, inkOf, SMALL_FONT } from './font';

const flat = (w: number, h: number, v: number) => new Uint8ClampedArray(w * h * 4).fill(v);
const gray = (w: number, h: number, v: number) => new Uint8Array(w * h).fill(v);
const effect = (x: Partial<AsciiEffect> = {}): AsciiEffect => ({ charset: 'classic', size: 'medium', color: 'image', ink: '#ffffff', ...x });

describe('bitmap fonts', () => {
  it('covers printable ASCII and keeps the spacing column and row clear', () => {
    for (let c = 32; c < 127; c++) {
      const g = FONT.glyphs.get(String.fromCharCode(c));
      expect(g, String.fromCharCode(c)).toBeDefined();
      for (let y = 0; y < 8; y++) expect(g![y * 6 + 5], `${String.fromCharCode(c)} column 5`).toBe(0);
      for (let x = 0; x < 6; x++) expect(g![7 * 6 + x], `${String.fromCharCode(c)} row 7`).toBe(0);
    }
  });

  it('gives every character set at least three levels in both fonts, sparse to dense', () => {
    for (const font of [FONT, SMALL_FONT])
      for (const set of CHARSETS) {
        const r = rampFor(font, set.id);
        expect(r.glyphs.length, `${set.id} ${font.cellW}`).toBeGreaterThanOrEqual(3);
        expect(r.chars[0]).toBe(' ');
        const ink = r.glyphs.map(inkOf);
        expect(ink).toEqual([...ink].sort((a, b) => a - b));
      }
  });
});

describe('ASCII effect', () => {
  it('centres the grid and leaves the remainder as background', () => {
    expect(asciiGrid(100, 50, 'medium')).toMatchObject({ cols: 16, rows: 6, ox: 2, oy: 1, cellW: 6, cellH: 8 });
    expect(asciiGrid(100, 50, 'large')).toMatchObject({ cols: 8, rows: 3, scale: 2, cellW: 12, cellH: 16 });
    expect(asciiGrid(100, 50, 'small')).toMatchObject({ cols: 25, rows: 8, cellW: 4, cellH: 6 });
  });

  it('draws the densest character for white and nothing for black on mono panels', () => {
    const g = asciiGrid(12, 8, 'medium');
    const dense = rampFor(g.font, 'classic').glyphs.at(-1)!;
    expect(asciiToMono(gray(12, 8, 0), 12, 8, effect()).every((b) => b === 0)).toBe(true);
    const lit = asciiToMono(gray(12, 8, 255), 12, 8, effect());
    for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) expect(lit[y * 12 + x]).toBe(dense[y * 6 + (x % 6)]);
  });

  it('colors characters with the ink and fills the rest with the background', () => {
    const out = asciiTo565(flat(6, 8, 255), 6, 8, effect({ color: 'solid', ink: '#ff0000' }), [0, 0, 255]);
    const glyph = rampFor(FONT, 'classic').glyphs.at(-1)!;
    for (let i = 0; i < 48; i++) expect(out[i]).toBe(glyph[i] ? to565(255, 0, 0) : to565(0, 0, 255));
  });

  it('shows image colors at full strength on dark backgrounds', () => {
    const src = new Uint8ClampedArray(6 * 8 * 4);
    for (let i = 0; i < src.length; i += 4) src.set([100, 50, 0, 255], i);
    const out = asciiTo565(src, 6, 8, effect(), [0, 0, 0]);
    expect(new Set(out)).toEqual(new Set([to565(0, 0, 0), to565(255, 127.5, 0)]));
  });

  it('turns the ramp around for dark ink on a light background', () => {
    // A white picture on white with black ink is all background: bright areas get no ink.
    const out = asciiTo565(flat(6, 8, 255), 6, 8, effect({ color: 'solid', ink: '#000000' }), [255, 255, 255]);
    expect(out.every((v) => v === to565(255, 255, 255))).toBe(true);
  });

  it('is part of the output pipeline and its cache', () => {
    const p = createProject({ presetId: 'st7789_240x240', width: 24, height: 16, scale: 1 });
    p.frames = [newFrame(24, 16, 100, flat(24, 16, 255))];
    const plain = processFrame(p, p.frames[0]);
    const ascii = processFrame({ ...p, ascii: effect() }, p.frames[0]);
    expect(ascii).not.toEqual(plain);
    expect(processFrame(p, p.frames[0])).toEqual(plain); // turning it off restores the picture
    const mono: Project = { ...p, presetId: 'ssd1306_128x64', ascii: effect() };
    expect(processFrame(mono, p.frames[0]).kind).toBe('mono');
  });
});

describe('atFullResolution', () => {
  it('scales frames up and keeps layers in place', async () => {
    const p = createProject({ presetId: 'st7789_240x240', width: 2, height: 2, scale: 3 });
    const px = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]);
    p.frames = [newFrame(2, 2, 100, px)];
    const layers: Layer[] = [
      { kind: 'paint', id: 'a', name: 'A', x: 1, y: 0, scale: 1 },
      { kind: 'sticker', id: 'b', x: 1, y: 1, size: 2, color: '#fff', outline: false, crisp: true, source: { type: 'emoji', char: 'x' } },
      { kind: 'clock', id: 'c', x: 5, y: 5, size: 10, color: '#fff', font: 'sans', bold: false, align: 'left', format: 'HH:mm' },
    ];
    p.layers = layers;
    const q = atFullResolution(p);
    expect([q.width, q.height, q.scale, q.offsetX, q.offsetY]).toEqual([6, 6, 1, p.offsetX, p.offsetY]);
    const at = (x: number, y: number) => [...q.frames[0].data.subarray((y * 6 + x) * 4, (y * 6 + x) * 4 + 3)];
    expect(at(0, 0)).toEqual([1, 2, 3]);
    expect(at(2, 2)).toEqual([1, 2, 3]);
    expect(at(3, 0)).toEqual([4, 5, 6]);
    expect(at(5, 5)).toEqual([10, 11, 12]);
    expect(q.frames[0].id).toBe(p.frames[0].id);
    expect(q.layers).toEqual([{ ...layers[0], x: 3, scale: 3 }, { ...layers[1], x: 3, y: 3, size: 6 }, layers[2]]);
    expect(atFullResolution(q)).toBe(q);
    await encodeDpa({ ...q, layers: [] });
  });
});

describe('terminal template', () => {
  it('keeps its letters on narrow portrait panels', () => {
    const t = TEMPLATES.find((x) => x.id === 'terminal')!;
    const p = templateProject(t, 'st7735s_80x160@1', { text: 'AB' });
    expect(p.width).toBeLessThan(96);
    // The panel image, with the template's layers baked in.
    const { px } = processFrame(p, p.frames.at(-1)!) as { px: Uint16Array };
    const glyph = FONT.glyphs.get('A')!, g = asciiGrid(p.width, p.height, 'medium');
    // "> AB": the A is the third character.
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 6; x++) {
        const i = (g.oy + y) * p.width + g.ox + 2 * 6 + x;
        expect(px[i] ? 1 : 0, `A at ${x},${y}`).toBe(glyph[y * 6 + x]);
      }
  });
});
