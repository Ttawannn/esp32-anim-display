import { afterEach, expect, it, vi } from 'vitest';
import { decodeGif } from './gif';
import { checkFrameBudget, MAX_GIF_BYTES } from './limits';
import { extractFrames, seek } from './video';

afterEach(() => vi.useRealTimers());

const gif = () => Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));

it('decodes a small GIF and rejects oversized geometry before decoding pixels', () => {
  expect(decodeGif(gif().buffer)).toMatchObject({ width: 1, height: 1, frames: [{ delay: 100 }] });
  const huge = gif();
  new DataView(huge.buffer).setUint16(6, 65535, true);
  expect(() => decodeGif(huge.buffer)).toThrow('หน่วยความจำ');
  expect(() => decodeGif(new ArrayBuffer(MAX_GIF_BYTES + 1))).toThrow('16 MB');
});

it('accepts small animations and rejects too many frames or excessive RGBA data', () => {
  expect(() => checkFrameBudget(60, 60, 2000)).not.toThrow();
  expect(() => checkFrameBudget(60, 60, 2001)).toThrow('2,000');
  expect(() => checkFrameBudget(240, 240, 1000)).toThrow('64 MB');
  expect(() => checkFrameBudget(0, 64, 1)).toThrow();
});

it('rejects excessive video extraction before allocating its canvas', async () => {
  await expect(extractFrames({ duration: 300 } as any, { start: 0, end: 300, fps: 30, width: 240, height: 240 } as any,
    () => {}, new AbortController().signal)).rejects.toThrow('หน่วยความจำ');
});

it('cancels while waiting for video seek and clears its timeout', async () => {
  vi.useFakeTimers();
  const video = Object.assign(new EventTarget(), { currentTime: 0, readyState: 1 }) as HTMLVideoElement;
  const controller = new AbortController();
  const pending = seek(video, 1, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

it('reports a seek timeout and releases listeners', async () => {
  vi.useFakeTimers();
  const video = Object.assign(new EventTarget(), { currentTime: 0, readyState: 1 }) as HTMLVideoElement;
  const pending = seek(video, 1);
  const rejected = expect(pending).rejects.toThrow('ใช้เวลานานเกินไป');
  await vi.advanceTimersByTimeAsync(10000);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});
