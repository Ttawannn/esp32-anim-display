import { encodeDpa, type EncodeResult, type EncodeWidgets } from './dpa';
import { widgetsFor } from '../layers/raster';
import type { Project } from '../model/types';
import { cancelled, checkFrameBudget } from '../import/limits';
import { TaskQueue } from './taskQueue';

export type EncodeProgress = (done: number, total: number) => void;
type Runner = (project: Project, progress: EncodeProgress, signal: AbortSignal) => Promise<EncodeResult>;

// Every setting that changes the encoded bytes. Names and editor UI state do not.
export function projectEncodingKey(p: Project): string {
  return JSON.stringify([p.presetId, p.width, p.height, p.scale, p.offsetX, p.offsetY, p.loop,
    p.background, p.encoding, p.jpegQuality, p.source, p.adjust, p.layers ?? []]);
}

interface Entry {
  key: string;
  frames: Project['frames'];
  result: Promise<EncodeResult>;
  listeners: Set<EncodeProgress>;
  progress?: [number, number];
  controller: AbortController;
  users: number;
  settled: boolean;
}

// Coalesces estimates, downloads and uploads, including requests made while encoding.
// Only four recent projects are retained; immutable pixel buffers are never detached.
export class EncodingCache {
  private entries: Entry[] = [];
  constructor(private run: Runner) {}

  encode(p: Project, onProgress?: EncodeProgress, signal?: AbortSignal): Promise<EncodeResult> {
    if (signal?.aborted) return Promise.reject(cancelled());
    try { checkFrameBudget(p.width, p.height, p.frames.length); }
    catch (error) { return Promise.reject(error); }
    const key = projectEncodingKey(p);
    let entry = this.entries.find((e) => e.key === key && e.frames.length === p.frames.length &&
      e.frames.every((f, i) => f.data === p.frames[i].data && f.delay === p.frames[i].delay));
    if (!entry) {
      const listeners = new Set<EncodeProgress>();
      const current: Entry = {
        key, frames: p.frames.slice(), listeners, controller: new AbortController(), users: 0, settled: false,
        result: Promise.resolve().then(() => this.run(p, (done, total) => {
          current.progress = [done, total];
          current.listeners.forEach((fn) => fn(done, total));
        }, current.controller.signal)).then((result) => {
          current.settled = true;
          current.listeners.clear();
          // Large results remain available to this caller without occupying the cache.
          if (result.bytes.length > 4 * 1024 * 1024) this.entries = this.entries.filter((e) => e !== current);
          return result;
        }, (error) => {
          current.settled = true;
          current.listeners.clear();
          this.entries = this.entries.filter((e) => e !== current);
          throw error;
        }),
      };
      entry = current;
      this.entries.push(entry);
      if (this.entries.length > 4) this.entries.shift();
    }
    const current = entry;
    current.users++;
    if (onProgress) { current.listeners.add(onProgress); if (current.progress) onProgress(...current.progress); }
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return false;
        done = true;
        current.users--;
        if (onProgress) current.listeners.delete(onProgress);
        signal?.removeEventListener('abort', abort);
        return true;
      };
      const abort = () => {
        if (!finish()) return;
        if (!current.users && !current.settled) {
          this.entries = this.entries.filter((entry) => entry !== current);
          current.controller.abort();
        }
        reject(cancelled());
      };
      signal?.addEventListener('abort', abort, { once: true });
      current.result.then((result) => { if (finish()) resolve(result); }, (error) => { if (finish()) reject(error); });
    });
  }
}

let worker: Worker | null = null;
let nextId = 0;
const queue = new TaskQueue();

function inWorker(p: Project, progress: EncodeProgress, signal: AbortSignal): Promise<EncodeResult> {
  if (signal.aborted) return Promise.reject(cancelled());
  // Clock glyphs are rendered here, with the page's fonts, so the board matches the preview.
  let widgets: EncodeWidgets | null;
  try {
    const w = widgetsFor(p);
    widgets = w && { block: w.block, boxes: w.boxes };
  } catch (error) {
    return Promise.reject(error);
  }
  if (typeof Worker === 'undefined') return encodeDpa(p, progress, signal, widgets);
  if (!worker) {
    try {
      worker = new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return encodeDpa(p, progress, signal, widgets);
    }
  }
  const target = worker;
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const finish = () => {
      signal.removeEventListener('abort', abort);
      target.onmessage = null;
      target.onerror = null;
    };
    const abort = () => {
      finish(); target.terminate(); worker = null; reject(cancelled());
    };
    signal.addEventListener('abort', abort, { once: true });
    target.onmessage = (event) => {
      if (event.data.id !== id) return;
      const { result, error, done, total } = event.data;
      if (done !== undefined) { progress(done, total); return; }
      finish();
      if (error) reject(new Error(error)); else resolve(result);
    };
    target.onerror = () => {
      finish(); target.terminate(); worker = null;
      reject(new Error('เข้ารหัสภาพไม่ได้ — ลองอีกครั้ง'));
    };
    try { target.postMessage({ id, project: p, widgets }); }
    catch (error) { finish(); reject(error); }
  });
}

const cache = new EncodingCache((p, progress, signal) => queue.run(() => inWorker(p, progress, signal), signal));
export const encodeProject = (p: Project, progress?: EncodeProgress, signal?: AbortSignal) => cache.encode(p, progress, signal);
