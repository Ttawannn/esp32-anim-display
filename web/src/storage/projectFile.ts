// .dpe project file: gzip( "DPE1" | u32 jsonLength | json | raw RGBA frames ).

import { newFrame } from '../model/project';
import { DEFAULT_ADJUST, type Project } from '../model/types';

const MAGIC = 'DPE1';

export async function saveProjectFile(p: Project): Promise<Blob> {
  const { frames, ...rest } = p;
  const json = new TextEncoder().encode(JSON.stringify({ ...rest, frames: frames.map((f) => ({ delay: f.delay })) }));
  const head = new Uint8Array(8);
  head.set([...MAGIC].map((c) => c.charCodeAt(0)));
  new DataView(head.buffer).setUint32(4, json.length, true);
  const raw = new Blob([head, json, ...frames.map((f) => f.data as BlobPart)]);
  return new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

export async function loadProjectFile(file: Blob): Promise<Project> {
  const bytes = new Uint8Array(await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== MAGIC) throw new Error('ไม่ใช่ไฟล์โปรเจกต์ .dpe');
  const len = new DataView(bytes.buffer).getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len)));
  const size = meta.width * meta.height * 4;
  let off = 8 + len;
  const frames = (meta.frames as { delay: number }[]).map((f) => {
    const data = new Uint8ClampedArray(bytes.slice(off, off + size).buffer);
    off += size;
    return newFrame(meta.width, meta.height, f.delay, data);
  });
  return { ...meta, adjust: { ...DEFAULT_ADJUST, ...meta.adjust }, frames };
}

export function download(data: Blob | Uint8Array, filename: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
