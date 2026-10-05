import { cancelled } from '../import/limits';
import { t } from '../i18n';

// Keep project buffers on the main side until work starts. Cancelled queued jobs never clone them.
export class TaskQueue {
  private waiting: { signal: AbortSignal; start: () => void; cancel: () => void }[] = [];
  private busy = false;
  run<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(cancelled());
    if (this.waiting.length >= 8) return Promise.reject(new Error(t('Too many jobs queued. Try again.')));
    return new Promise((resolve, reject) => {
      const job = {
        signal,
        cancel: () => {
          this.waiting = this.waiting.filter((entry) => entry !== job);
          reject(cancelled());
        },
        start: () => {
          signal.removeEventListener('abort', job.cancel);
          this.busy = true;
          Promise.resolve().then(work).then(resolve, reject).finally(() => { this.busy = false; this.next(); });
        },
      };
      signal.addEventListener('abort', job.cancel, { once: true });
      this.waiting.push(job);
      this.next();
    });
  }
  private next() {
    if (!this.busy) this.waiting.shift()?.start();
  }
}
