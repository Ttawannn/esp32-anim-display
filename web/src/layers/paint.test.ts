import { describe, expect, it } from 'vitest';
import { newFrame } from '../model/project';
import type { Cel, PaintLayer, Pixels, Project } from '../model/types';
import { loadProjectFile, saveProjectFile } from '../storage/projectFile';
import { celAlphaAt, celInto, compositeCel, flipCel, liftPixels, trimCel } from './paint';
import { bakeLayers } from './raster';

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

function buffer(w: number, h: number, dots: [number, number, number[]][] = []): Pixels {
  const d = new Uint8ClampedArray(w * h * 4);
  for (const [x, y, c] of dots) d.set(c, (y * w + x) * 4);
  return d;
}
const px = (d: Pixels, w: number, x: number, y: number) => [...d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
const layer = (o: Partial<PaintLayer> = {}): PaintLayer => ({ kind: 'paint', id: 'a', name: 'A', x: 0, y: 0, scale: 1, ...o });

describe('paint layers', () => {
  it('trims a buffer to its visible pixels and keeps the offset', () => {
    const cel = trimCel(buffer(6, 5, [[2, 1, RED], [3, 3, BLUE]]), 6, 5, 10, 20)!;
    expect([cel.x, cel.y, cel.w, cel.h]).toEqual([12, 21, 2, 3]);
    expect(px(cel.data, cel.w, 0, 0)).toEqual(RED);
    expect(px(cel.data, cel.w, 1, 2)).toEqual(BLUE);
    expect(trimCel(buffer(3, 3), 3, 3, 0, 0)).toBeNull();
  });

  it('round-trips a cel through a larger work area', () => {
    const cel = trimCel(buffer(4, 4, [[1, 2, RED]]), 4, 4, -3, 5)!;
    const work = celInto(cel, -5, 0, 10, 10);
    expect(trimCel(work, 10, 10, -5, 0)).toEqual(cel);
  });

  it('composites at the layer position and scale, keeping pixels past the edge', () => {
    const cel: Cel = { x: 0, y: 0, w: 2, h: 1, data: buffer(2, 1, [[0, 0, RED], [1, 0, BLUE]]) };
    const dst = buffer(8, 4);
    compositeCel(dst, 8, 4, layer({ x: 2, y: 1, scale: 2 }), cel);
    expect(px(dst, 8, 2, 1)).toEqual(RED);
    expect(px(dst, 8, 3, 2)).toEqual(RED);
    expect(px(dst, 8, 4, 1)).toEqual(BLUE);
    expect(px(dst, 8, 5, 2)).toEqual(BLUE);
    expect(px(dst, 8, 6, 1)[3]).toBe(0);
    // Moved partly off the canvas: the cel itself is unchanged and moving back shows it again.
    const off = buffer(8, 4);
    compositeCel(off, 8, 4, layer({ x: -1 }), cel);
    expect(px(off, 8, 0, 0)).toEqual(BLUE);
    expect(celAlphaAt(layer({ x: 2, y: 1, scale: 2 }), cel, 5, 2)).toBe(255);
  });

  it('flips a cel around its own centre', () => {
    const cel: Cel = { x: 3, y: 4, w: 2, h: 1, data: buffer(2, 1, [[0, 0, RED]]) };
    const f = flipCel(cel, true);
    expect([f.x, f.y]).toEqual([3, 4]);
    expect(px(f.data, 2, 1, 0)).toEqual(RED);
  });

  it('lifts the pixels inside a rectangle out of a frame', () => {
    const data = buffer(5, 5, [[1, 1, RED], [3, 3, BLUE]]);
    const { cel, rest } = liftPixels(data, 5, 5, { x: 0, y: 0, w: 3, h: 3 });
    expect([cel!.x, cel!.y, cel!.w, cel!.h]).toEqual([1, 1, 1, 1]);
    expect(px(rest, 5, 1, 1)[3]).toBe(0);
    expect(px(rest, 5, 3, 3)).toEqual(BLUE);
    expect(px(data, 5, 1, 1)).toEqual(RED); // the frame itself is not modified
    expect(liftPixels(data, 5, 5, { x: 4, y: 0, w: 1, h: 1 }).cel).toBeNull();
  });
});

function project(): Project {
  const shared: Cel = { x: 0, y: 0, w: 1, h: 1, data: buffer(1, 1, [[0, 0, BLUE]]) };
  const f0 = newFrame(4, 4, 100, buffer(4, 4, [[0, 0, RED]]));
  const f1 = newFrame(4, 4, 200, buffer(4, 4));
  f0.cels = { a: shared };
  f1.cels = { a: shared };
  return {
    name: 'p', presetId: 'st7789_240x240', width: 4, height: 4, scale: 1, offsetX: 0, offsetY: 0, background: '#000000',
    frames: [f0, f1], loop: 0, encoding: 'auto', jpegQuality: 0.75, source: 'pixel',
    adjust: { brightness: 0, contrast: 0, saturation: 0, hue: 0, invert: false, colors: 0, threshold: 128, dither: 'floyd' },
    layers: [layer({ x: 2, y: 3 })],
  };
}

describe('baking', () => {
  it('draws visible paint layers over the frame and caches the result', () => {
    const p = project();
    const out = bakeLayers(p, p.frames[0]);
    expect(px(out, 4, 0, 0)).toEqual(RED);
    expect(px(out, 4, 2, 3)).toEqual(BLUE);
    expect(bakeLayers(p, p.frames[0])).toBe(out);
    const hidden = { ...p, layers: [layer({ x: 2, y: 3, hidden: true })] };
    expect(bakeLayers(hidden, p.frames[0])).toBe(p.frames[0].data);
    const moved = { ...p, layers: [layer({ x: 0, y: 0 })] };
    expect(px(bakeLayers(moved, p.frames[0]), 4, 0, 0)).toEqual(BLUE);
  });
});

describe('.dpe files', () => {
  it('round-trip paint layers and store a shared cel once', async () => {
    const p = project();
    const loaded = await loadProjectFile(await saveProjectFile(p));
    expect(loaded.layers).toEqual(p.layers);
    expect(loaded.frames.map((f) => f.delay)).toEqual([100, 200]);
    expect([...loaded.frames[0].data]).toEqual([...p.frames[0].data]);
    const [c0, c1] = loaded.frames.map((f) => f.cels!.a);
    expect(c0).toEqual(p.frames[0].cels!.a);
    expect(c1.data).toBe(c0.data);
  });

  it('loads files without cels as before', async () => {
    const p = { ...project(), layers: [] };
    p.frames = p.frames.map((f) => ({ ...f, cels: undefined }));
    const loaded = await loadProjectFile(await saveProjectFile(p));
    expect(loaded.frames.every((f) => !f.cels)).toBe(true);
  });
});
