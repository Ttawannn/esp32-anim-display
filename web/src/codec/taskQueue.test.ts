import { expect, it, vi } from 'vitest';
import { TaskQueue } from './taskQueue';

it('never starts cancelled queued work and continues with the next job', async () => {
  const queue = new TaskQueue();
  let finish!: () => void;
  const first = queue.run(() => new Promise<void>((resolve) => { finish = resolve; }), new AbortController().signal);
  const cancelled = new AbortController();
  const unused = vi.fn(async () => 2);
  const second = queue.run(unused, cancelled.signal);
  const rejected = expect(second).rejects.toMatchObject({ name: 'AbortError' });
  const latest = vi.fn(async () => 3);
  const third = queue.run(latest, new AbortController().signal);
  await vi.waitFor(() => expect(finish).toBeDefined());
  cancelled.abort();
  await rejected;
  finish();
  await first;
  expect(await third).toBe(3);
  expect(unused).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledOnce();
});

it('releases its active slot after a failed job', async () => {
  const queue = new TaskQueue();
  await expect(queue.run(async () => { throw new Error('failed'); }, new AbortController().signal)).rejects.toThrow('failed');
  expect(await queue.run(async () => 4, new AbortController().signal)).toBe(4);
});
