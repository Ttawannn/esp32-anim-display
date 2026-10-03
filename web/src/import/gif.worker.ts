import { decodeGif } from './gif';

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<ArrayBuffer>) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = decodeGif(data, (done, total) => scope.postMessage({ done, total }));
    scope.postMessage({ result }, result.frames.map((frame) => frame.data.buffer));
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
