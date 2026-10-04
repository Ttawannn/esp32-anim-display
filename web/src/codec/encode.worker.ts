import { encodeDpa, type EncodeWidgets } from './dpa';
import type { Project } from '../model/types';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ id: number; project: Project; widgets: EncodeWidgets | null }>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let queue = Promise.resolve();
scope.onmessage = ({ data: { id, project, widgets } }) => {
  queue = queue.then(async () => {
    try {
      const result = await encodeDpa(project, (done, total) => scope.postMessage({ id, done, total }), undefined, widgets);
      scope.postMessage({ id, result }, [result.bytes.buffer as ArrayBuffer]);
    } catch (error) {
      scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
