import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../model/project';
import { encodeDpa } from './dpa';
import { EncodingCache, projectEncodingKey } from './encode';

describe('encoding cache', () => {
  it('cancels unused estimates while keeping a shared export alive', async () => {
    let finish!: (value: Awaited<ReturnType<typeof encodeDpa>>) => void;
    let workSignal!: AbortSignal;
    const run = vi.fn((_p, _progress, signal: AbortSignal) => {
      workSignal = signal;
      return new Promise<Awaited<ReturnType<typeof encodeDpa>>>((resolve) => { finish = resolve; });
    });
    const cache = new EncodingCache(run);
    const p = createProject({ presetId: 'st7789_240x240', width: 4, height: 4 });
    const estimate = new AbortController();
    const pending = cache.encode(p, undefined, estimate.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const exporting = cache.encode(p);
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    estimate.abort();
    await rejected;
    expect(workSignal.aborted).toBe(false);
    finish(await encodeDpa(p));
    expect((await exporting).bytes.length).toBeGreaterThan(0);
  });

  it('aborts the underlying job when its last caller leaves and permits retry', async () => {
    let workSignal!: AbortSignal;
    const run = vi.fn((_p, _progress, signal: AbortSignal) => {
      workSignal = signal;
      return new Promise<Awaited<ReturnType<typeof encodeDpa>>>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError'))));
    });
    const cache = new EncodingCache(run);
    const p = createProject({ presetId: 'st7789_240x240', width: 4, height: 4 });
    const controller = new AbortController();
    const pending = cache.encode(p, undefined, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    expect(workSignal.aborted).toBe(true);
    run.mockImplementation(encodeDpa);
    expect((await cache.encode(p)).bytes.length).toBeGreaterThan(0);
  });

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
