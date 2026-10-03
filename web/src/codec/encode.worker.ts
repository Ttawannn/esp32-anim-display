import { encodeDpa } from './dpa';
import type { Project } from '../model/types';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ id: number; project: Project }>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let queue = Promise.resolve();
scope.onmessage = ({ data: { id, project } }) => {
  queue = queue.then(async () => {
    try {
      const result = await encodeDpa(project, (done, total) => scope.postMessage({ id, done, total }));
      scope.postMessage({ id, result }, [result.bytes.buffer as ArrayBuffer]);
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
