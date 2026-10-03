import { decodeGif, type DecodedGif } from './gif';
import { cancelled } from './limits';

export function decodeGifAsync(buffer: ArrayBuffer, signal: AbortSignal, progress?: (done: number, total: number) => void): Promise<DecodedGif> {
  if (signal.aborted) return Promise.reject(cancelled());
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => decodeGif(buffer, progress));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
    const finish = () => { signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { finish(); reject(cancelled()); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.done !== undefined) { progress?.(data.done, data.total); return; }
      finish();
      if (data.error) reject(new Error(data.error)); else resolve(data.result);
    };
    worker.onerror = () => { finish(); reject(new Error('อ่านไฟล์ GIF ไม่ได้')); };
    try { worker.postMessage(buffer, [buffer]); }
    catch (error) { finish(); reject(error); }
  });
}
