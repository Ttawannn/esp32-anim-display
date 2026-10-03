import { expect, it, vi } from 'vitest';
import { ThumbnailCache } from './thumbnailCache';

it('invalidates same-name, same-size images and releases the old URL', async () => {
  const revoke = vi.fn();
  const cache = new ThumbnailCache(2, revoke);
  const render = vi.fn().mockResolvedValueOnce('blob:old').mockResolvedValueOnce('blob:new');
  expect(await cache.get('board|a|100', render)).toBe('blob:old');
  cache.invalidate('board|a|');
  expect(await cache.get('board|a|100', render)).toBe('blob:new');
  expect(revoke).toHaveBeenCalledWith('blob:old');
});

it('revokes evicted URLs and keeps recently used images', async () => {
  const revoke = vi.fn();
  const cache = new ThumbnailCache(2, revoke);
  await cache.get('a', async () => 'blob:a');
  await cache.get('b', async () => 'blob:b');
  await cache.get('a', async () => null);
  await cache.get('c', async () => 'blob:c');
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:b');
  expect(await cache.get('a', async () => null)).toBe('blob:a');
});

it('discards a late result after invalidation and allows retry after a failed read', async () => {
  const revoke = vi.fn();
  const cache = new ThumbnailCache(2, revoke);
  let finish!: (url: string) => void;
  const pending = cache.get('a', () => new Promise((resolve) => { finish = resolve; }));
  await vi.waitFor(() => expect(finish).toBeDefined());
  cache.invalidate('a');
  finish('blob:late');
  expect(await pending).toBeNull();
  expect(revoke).toHaveBeenCalledWith('blob:late');
  expect(await cache.get('b', async () => { throw new Error('offline'); })).toBeNull();
  expect(await cache.get('b', async () => 'blob:retry')).toBe('blob:retry');
});

it('keeps visible images usable when concurrent tiles exceed the cache limit', async () => {
  const revoke = vi.fn();
  const cache = new ThumbnailCache(2, revoke);
  const images = ['a', 'b', 'c'].map((key) => cache.acquire(key, async () => `blob:${key}`));
  expect(await Promise.all(images.map((image) => image.promise))).toEqual(['blob:a', 'blob:b', 'blob:c']);
  expect(revoke).not.toHaveBeenCalled();
  images[0].release();
  images[0].release();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:a');
  images[1].release();
  images[2].release();
  cache.invalidate('');
  expect(revoke).toHaveBeenCalledTimes(3);
});

it('releases an evicted tile that unmounts before its render finishes', async () => {
  const revoke = vi.fn();
  const cache = new ThumbnailCache(1, revoke);
  let finish!: (url: string) => void;
  const image = cache.acquire('a', () => new Promise((resolve) => { finish = resolve; }));
  await vi.waitFor(() => expect(finish).toBeDefined());
  await cache.get('b', async () => 'blob:b');
  image.release();
  finish('blob:late');
  expect(await image.promise).toBeNull();
  expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:late');
});
