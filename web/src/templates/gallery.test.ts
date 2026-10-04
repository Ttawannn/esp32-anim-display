import { describe, expect, it } from 'vitest';
import { encodeDpa } from '../codec/dpa';
import { PRESETS } from '../model/presets';
import { TEMPLATES, templateProject } from './gallery';

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
});
