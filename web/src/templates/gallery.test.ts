import { describe, expect, it } from 'vitest';
import { encodeDpa } from '../codec/dpa';
import { bakeLayers } from '../layers/raster';
import { PRESETS } from '../model/presets';
import { hexToRgb } from '../model/project';
import { TEMPLATES, templateContext, templateProject } from './gallery';

// Generated animations must fit comfortably in the board's ~2 MB of animation storage.
const BUDGET = 400 * 1024;

describe('animation templates', () => {
  for (const t of TEMPLATES.filter((x) => !x.canvas)) {
    it(`${t.id} works on every display`, async () => {
      const sizes: string[] = [];
      for (const preset of PRESETS) {
        const p = templateProject(t, preset.id, {});
        expect(p.frames.length).toBeGreaterThan(0);
        for (const f of p.frames) expect(f.data.length).toBe(p.width * p.height * 4);
        expect(p.width * p.scale).toBeLessThanOrEqual(preset.width);
        expect(p.height * p.scale).toBeLessThanOrEqual(preset.height);
        const { bytes } = await encodeDpa(p);
        sizes.push(`${preset.id} ${(bytes.length / 1024).toFixed(0)}K`);
        expect(bytes.length, `${t.id} on ${preset.id}`).toBeLessThan(BUDGET);
      }
      console.log(`${t.id}: ${sizes.join(', ')}`);
    });
  }

  // Templates arrive as layers; baked over the background they give back the generated frames.
  for (const t of TEMPLATES.filter((x) => !x.canvas)) {
    it(`${t.id} arrives as layers that bake back to the same picture`, () => {
      for (const preset of PRESETS) {
        const g = t.generate(templateContext(t, preset.id), { ...t.defaults });
        const p = templateProject(t, preset.id, {});
        const paint = (p.layers ?? []).filter((l) => l.kind === 'paint');
        expect(paint.length, `${t.id} on ${preset.id}`).toBeGreaterThan(0);
        if (g.parts) continue; // drawn as separate parts, nothing to compare against
        const [r, gr, b] = hexToRgb(p.background);
        p.frames.forEach((f, i) => {
          const out = bakeLayers(p, f), want = g.frames[i].data;
          for (let k = 0; k < out.length; k += 4) {
            const got = out[k + 3] ? [out[k], out[k + 1], out[k + 2]] : [r, gr, b];
            if (got[0] !== want[k] || got[1] !== want[k + 1] || got[2] !== want[k + 2])
              throw new Error(`${t.id} on ${preset.id}: frame ${i} pixel ${k / 4} is ${got}, expected ${[...want.subarray(k, k + 3)]}`);
          }
        });
      }
    });
  }

  it('names the separate parts', () => {
    const names = (id: string) => (templateProject(TEMPLATES.find((x) => x.id === id)!, 'st7789_240x240', {}).layers ?? []).map((l) => l.kind === 'paint' ? l.name : l.kind);
    expect(names('pacman')).toEqual(['Dots', 'Pac-Man', 'Ghost']);
    expect(names('bounce')).toEqual(['Shadow', 'Ball']);
    expect(names('heart')).toEqual(['Beating heart']);
  });
});
