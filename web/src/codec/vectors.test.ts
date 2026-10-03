// Writes shared/test-vectors: .dpa files from the real encoder plus the expected canvas after each
// frame (<name>.expected = per frame, canvasW*canvasH RGB565 little-endian). The firmware's native
// test (firmware/test/native) decodes the .dpa files and must reproduce them exactly.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, newFrame } from '../model/project';
import type { Project } from '../model/types';
import { decodeDpa, encodeDpa } from './dpa';

const OUT = join(__dirname, '..', '..', '..', 'shared', 'test-vectors');

function img(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number?]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      d.set([r, g, b, a], (y * w + x) * 4);
    }
  return d;
}

const CASES: Record<string, () => Project> = {
  // Few colors, scale 4, delta frames incl. an unchanged one.
  indexed_delta: () => {
    const p = createProject({ presetId: 'st7789_240x240', width: 24, height: 16, scale: 4, background: '#102030' });
    const base = img(24, 16, (x, y) => (x < 12 ? [255, 0, 77] : y < 8 ? [41, 173, 255] : [0, 0, 0, 0]));
    const moved = base.slice();
    for (let x = 3; x < 9; x++) moved.set([255, 236, 39, 255], (5 * 24 + x) * 4);
    const moved2 = moved.slice();
    moved2.set([0, 228, 54, 255], (15 * 24 + 23) * 4);
    p.frames = [newFrame(24, 16, 100, base), newFrame(24, 16, 80, moved), newFrame(24, 16, 300, moved.slice()), newFrame(24, 16, 60, moved2)];
    return p;
  },
  // More than 256 colors (forces quantization), long literal and repeat runs.
  indexed_many: () => {
    const p = createProject({ presetId: 'gc9a01_240_round', width: 64, height: 48, scale: 1 });
    const a = img(64, 48, (x, y) => [x * 4, y * 5, (x * y) & 255]);
    const b = img(64, 48, (x, y) => (y > 30 ? [200, 200, 200] : [x * 4, y * 5, (x * y) & 255]));
    p.frames = [newFrame(64, 48, 50, a), newFrame(64, 48, 50, b)];
    return p;
  },
  // Height not a multiple of 8 (padding rows), delta limited to the second page.
  mono_pad: () => {
    const p = createProject({ presetId: 'ssd1306_128x64', width: 20, height: 10, scale: 2 });
    p.adjust.dither = 'none';
    const a = img(20, 10, (x, y) => ((x + y) % 3 === 0 ? [255, 255, 255] : [0, 0, 0]));
    const b = a.slice();
    for (let x = 4; x < 9; x++) b.set([255, 255, 255, 255], (9 * 20 + x) * 4);
    p.frames = [newFrame(20, 10, 100, a), newFrame(20, 10, 100, b), newFrame(20, 10, 100, b.slice())];
    return p;
  },
  // Full-size OLED frame: exercises the direct framebuffer path.
  mono_full: () => {
    const p = createProject({ presetId: 'ssd1306_128x64', width: 128, height: 64, scale: 1 });
    p.adjust.dither = 'bayer';
    const a = img(128, 64, (x, y) => [x * 2, y * 4, 128]);
    const b = img(128, 64, (x, y) => (Math.hypot(x - 64, y - 32) < 20 ? [255, 255, 255] : [x * 2, y * 4, 128]));
    p.frames = [newFrame(128, 64, 40, a), newFrame(128, 64, 40, b)];
    return p;
  },
};

describe('shared test vectors', () => {
  mkdirSync(OUT, { recursive: true });
  for (const [name, make] of Object.entries(CASES)) {
    it(`writes ${name}`, async () => {
      const { bytes } = await encodeDpa(make());
      const d = decodeDpa(bytes);
      const expected = new Uint8Array(d.frames.length * d.canvasW * d.canvasH * 2);
      d.frames.forEach((f, i) => expected.set(new Uint8Array(f.pixels!.buffer), i * d.canvasW * d.canvasH * 2));
      writeFileSync(join(OUT, `${name}.dpa`), bytes);
      writeFileSync(join(OUT, `${name}.expected`), expected);
      expect(d.frames.length).toBeGreaterThan(0);
    });
  }
});
