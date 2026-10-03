import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../model/project';
import { encodeDpa } from './dpa';
import { EncodingCache, projectEncodingKey } from './encode';

describe('encoding cache', () => {
  it('shares an in-flight estimate with export and ignores name changes', async () => {
    const run = vi.fn(encodeDpa);
    const cache = new EncodingCache(run);
    const p = createProject({ presetId: 'st7789_240x240', width: 4, height: 4 });
    const [a, b] = await Promise.all([cache.encode(p), cache.encode({ ...p, name: 'renamed' })]);
    expect(a).toBe(b);
    expect(run).toHaveBeenCalledOnce();
    expect(await cache.encode(p)).toBe(a);
  });

  it('invalidates pixels, frame delays and every encoded setting', async () => {
    const run = vi.fn(encodeDpa);
    const cache = new EncodingCache(run);
    const p = createProject({ presetId: 'st7789_240x240', width: 4, height: 4 });
    const base = await cache.encode(p);
    expect(await cache.encode({ ...p, frames: [{ ...p.frames[0], data: p.frames[0].data.slice() }] })).not.toBe(base);
    expect(await cache.encode({ ...p, frames: [{ ...p.frames[0], delay: 300 }] })).not.toBe(base);
    for (const patch of [{ scale: 2 }, { offsetX: 7 }, { offsetY: 8 }, { loop: 2 },
      { jpegQuality: 0.6 }, { encoding: 'indexed' as const }, { source: 'gif' as const },
      { background: '#ffffff' }, { adjust: { ...p.adjust, brightness: 10 } }]) {
      expect(projectEncodingKey({ ...p, ...patch })).not.toBe(projectEncodingKey(p));
    }
  });

  it('allows retry after encoding fails', async () => {
    const run = vi.fn(encodeDpa).mockRejectedValueOnce(new Error('failed'));
    const cache = new EncodingCache(run);
    const p = createProject({ presetId: 'st7789_240x240', width: 4, height: 4 });
    await expect(cache.encode(p)).rejects.toThrow('failed');
    expect((await cache.encode(p)).bytes.length).toBeGreaterThan(0);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
