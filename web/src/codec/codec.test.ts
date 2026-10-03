import { describe, expect, it } from 'vitest';
import { to565 } from '../color/rgb565';
import { quantize } from '../color/quantize';
import { createProject, newFrame } from '../model/project';
import { decodeDpa, encodeDpa, FRAME_INDEXED, FRAME_MONO, toPages } from './dpa';
import { rleDecode, rleEncode } from './rle';

function rgba(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Uint8ClampedArray<ArrayBuffer> {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      d.set([r, g, b, 255], (y * w + x) * 4);
    }
  return d;
}

describe('rle', () => {
  const cases: [string, number[]][] = [
    ['empty', []],
    ['single', [7]],
    ['literal', [1, 2, 3, 4, 5]],
    ['repeat', Array(300).fill(9)],
    ['mixed', [1, 1, 2, 3, 3, 3, 4, 5, 6, 6]],
    ['long literal', Array.from({ length: 400 }, (_, i) => i % 251)],
    ['pair at end', [1, 2, 3, 3]],
  ];
  for (const [name, data] of cases) {
    it(`round-trips ${name}`, () => {
      const src = Uint8Array.from(data);
      expect(Array.from(rleDecode(rleEncode(src), src.length))).toEqual(data);
    });
  }
  it('compresses runs', () => {
    expect(rleEncode(new Uint8Array(1000)).length).toBeLessThan(20);
  });
});

describe('quantize', () => {
  it('is exact when colors fit', () => {
    const q = quantize([Uint16Array.from([1, 2, 3, 2, 1])], 256);
    expect(q.exact).toBe(true);
    expect(q.palette.length).toBe(3);
  });
  it('reduces to the requested count', () => {
    const px = Uint16Array.from({ length: 4096 }, (_, i) => i * 13);
    const q = quantize([px], 16);
    expect(q.palette.length).toBeLessThanOrEqual(16);
    expect(q.exact).toBe(false);
  });
});

describe('dpa', () => {
  it('round-trips indexed frames with delta rects', async () => {
    const p = createProject({ presetId: 'st7789_240x240', width: 16, height: 8 });
    const a = rgba(16, 8, (x) => (x < 8 ? [255, 0, 0] : [0, 0, 255]));
    const b = a.slice();
    b.set([0, 255, 0, 255], (3 * 16 + 5) * 4); // one changed pixel
    p.frames = [newFrame(16, 8, 100, a), newFrame(16, 8, 50, b), newFrame(16, 8, 70, b.slice())];

    const res = await encodeDpa(p);
    expect(res.mode).toBe('indexed');
    const d = decodeDpa(res.bytes);
    expect(d.canvasW).toBe(16);
    expect(d.scale).toBe(p.scale);
    expect(d.screenW).toBe(240);
    expect(d.frames.map((f) => f.type)).toEqual([FRAME_INDEXED, FRAME_INDEXED, FRAME_INDEXED]);
    expect(d.frames.map((f) => f.delay)).toEqual([100, 50, 70]);
    expect(d.frames[0].key).toBe(true);
    expect(d.frames[1].key).toBe(false);
    // frame 1 is a 1x1 delta, frame 2 is unchanged (empty rect)
    expect(d.frames[1].size).toBeLessThan(16);
    expect(d.frames[2].size).toBe(8);

    const red = to565(255, 0, 0), blue = to565(0, 0, 255), green = to565(0, 255, 0);
    expect(d.frames[0].pixels![0]).toBe(red);
    expect(d.frames[0].pixels![15]).toBe(blue);
    expect(d.frames[1].pixels![3 * 16 + 5]).toBe(green);
    expect(d.frames[2].pixels).toEqual(d.frames[1].pixels);
  });

  it('round-trips mono frames in page layout', async () => {
    const p = createProject({ presetId: 'ssd1306_128x64', width: 12, height: 10 });
    p.adjust.dither = 'none';
    const img = rgba(12, 10, (x, y) => ((x + y) % 3 === 0 ? [255, 255, 255] : [0, 0, 0]));
    p.frames = [newFrame(12, 10, 80, img)];
    const res = await encodeDpa(p);
    expect(res.mode).toBe('mono');
    const d = decodeDpa(res.bytes);
    expect(d.colorMode).toBe(1);
    expect(d.frames[0].type).toBe(FRAME_MONO);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 12; x++)
        expect(d.frames[0].pixels![y * 12 + x]).toBe((x + y) % 3 === 0 ? 0xffff : 0);
  });

  it('packs pages with bit 0 at the top', () => {
    const bits = new Uint8Array(2 * 8);
    bits[0] = 1; // (0,0)
    bits[7 * 2 + 1] = 1; // (1,7)
    expect(Array.from(toPages(bits, 2, 8, 0))).toEqual([0x01, 0x80]);
  });
});
