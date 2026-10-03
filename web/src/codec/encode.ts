import { encodeDpa, type EncodeResult } from './dpa';
import type { Project } from '../model/types';

export type EncodeProgress = (done: number, total: number) => void;
type Runner = (project: Project, progress: EncodeProgress) => Promise<EncodeResult>;

// Every setting that changes the encoded bytes. Names and editor UI state do not.
export function projectEncodingKey(p: Project): string {
  return JSON.stringify([p.presetId, p.width, p.height, p.scale, p.offsetX, p.offsetY, p.loop,
    p.background, p.encoding, p.jpegQuality, p.source, p.adjust]);
}

interface Entry {
  key: string;
  frames: Project['frames'];
  result: Promise<EncodeResult>;
  listeners: Set<EncodeProgress>;
  progress?: [number, number];
}

// Coalesces estimates, downloads and uploads, including requests made while encoding.
// Only four recent projects are retained; immutable pixel buffers are never detached.
export class EncodingCache {
  private entries: Entry[] = [];
  constructor(private run: Runner) {}

  encode(p: Project, onProgress?: EncodeProgress): Promise<EncodeResult> {
    const key = projectEncodingKey(p);
    let entry = this.entries.find((e) => e.key === key && e.frames.length === p.frames.length &&
      e.frames.every((f, i) => f.data === p.frames[i].data && f.delay === p.frames[i].delay));
    if (!entry) {
      const listeners = new Set<EncodeProgress>();
      const current: Entry = {
        key, frames: p.frames.slice(), listeners,
        result: Promise.resolve().then(() => this.run(p, (done, total) => {
          current.progress = [done, total];
          current.listeners.forEach((fn) => fn(done, total));
        })).then((result) => {
          current.listeners.clear();
          // Large results remain available to this caller without occupying the cache.
          if (result.bytes.length > 4 * 1024 * 1024) this.entries = this.entries.filter((e) => e !== current);
          return result;
        }, (error) => {
          current.listeners.clear();
          this.entries = this.entries.filter((e) => e !== current);
          throw error;
        }),
      };
      entry = current;
      this.entries.push(entry);
      if (this.entries.length > 4) this.entries.shift();
    }
    if (onProgress) {
      entry.listeners.add(onProgress);
      if (entry.progress) onProgress(...entry.progress);
      const listeners = entry.listeners;
      return entry.result.finally(() => listeners.delete(onProgress));
    }
    return entry.result;
  }
}

let worker: Worker | null = null;
let nextId = 0;
const jobs = new Map<number, { resolve: (r: EncodeResult) => void; reject: (e: Error) => void; progress: EncodeProgress }>();

function run(p: Project, progress: EncodeProgress): Promise<EncodeResult> {
  if (typeof Worker === 'undefined') return encodeDpa(p, progress);
  if (!worker) {
    try {
      worker = new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      return encodeDpa(p, progress);
    }
    worker.onmessage = (event) => {
      const { id, result, error, done, total } = event.data;
      const job = jobs.get(id);
      if (!job) return;
      if (done !== undefined) { job.progress(done, total); return; }
      jobs.delete(id);
      if (error) job.reject(new Error(error));
      else job.resolve(result);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      jobs.forEach((job) => job.reject(new Error('เข้ารหัสภาพไม่ได้ — ลองอีกครั้ง')));
      jobs.clear();
    };
  }
  const target = worker;
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    jobs.set(id, { resolve, reject, progress });
    try { target.postMessage({ id, project: p }); }
    catch (error) { jobs.delete(id); reject(error); }
  });
}

const cache = new EncodingCache(run);
export const encodeProject = (p: Project, progress?: EncodeProgress) => cache.encode(p, progress);
