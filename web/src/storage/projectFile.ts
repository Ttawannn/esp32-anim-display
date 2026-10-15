// .dpe project file: gzip( "DPE1" | u32 jsonLength | json | raw RGBA frames | raw cel buffers ).
// Paint layer cels are listed per frame as { x, y, w, h, b }, b indexing the cel buffers that follow
// the frames; a cel shared by several frames is stored once. Files without cels load as before.

import { newFrame } from '../model/project';
import { DEFAULT_ADJUST, type Cel, type Pixels, type Project } from '../model/types';
import { t } from '../i18n';

const MAGIC = 'DPE1';

type CelMeta = Omit<Cel, 'data'> & { b: number };

export async function saveProjectFile(p: Project): Promise<Blob> {
  const { frames, ...rest } = p;
  const buffers: Pixels[] = [];
  const index = new Map<Pixels, number>();
  const frameMeta = frames.map((f) => {
    if (!f.cels) return { delay: f.delay };
    const cels: Record<string, CelMeta> = {};
    for (const [id, { data, ...box }] of Object.entries(f.cels)) {
      let b = index.get(data);
      if (b === undefined) {
        b = buffers.push(data) - 1;
        index.set(data, b);
      }
      cels[id] = { ...box, b };
    }
    return { delay: f.delay, cels };
  });
  const json = new TextEncoder().encode(JSON.stringify({ ...rest, frames: frameMeta }));
  const head = new Uint8Array(8);
  head.set([...MAGIC].map((c) => c.charCodeAt(0)));
  new DataView(head.buffer).setUint32(4, json.length, true);
  const raw = new Blob([head, json, ...frames.map((f) => f.data as BlobPart), ...buffers.map((d) => d as BlobPart)]);
  return new Response(raw.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

export async function loadProjectFile(file: Blob): Promise<Project> {
  const bytes = new Uint8Array(await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== MAGIC) throw new Error(t('Not a .dpe project file'));
  const len = new DataView(bytes.buffer).getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len)));
  const size = meta.width * meta.height * 4;
  let off = 8 + len;
  const take = (n: number): Pixels => {
    const data = new Uint8ClampedArray(bytes.slice(off, off + n).buffer);
    off += n;
    return data;
  };
  type FrameMeta = { delay: number; cels?: Record<string, CelMeta> };
  const list = meta.frames as FrameMeta[];
  const frames = list.map((f) => newFrame(meta.width, meta.height, f.delay, take(size)));
  // Cel buffers follow the frames, in index order.
  const sizes: number[] = [];
  for (const f of list) for (const c of Object.values(f.cels ?? {})) sizes[c.b] ??= c.w * c.h * 4;
  const buffers = sizes.map((n) => take(n));
  list.forEach((f, i) => {
    if (!f.cels) return;
    frames[i].cels = Object.fromEntries(Object.entries(f.cels).map(([id, c]) =>
      [id, { x: c.x, y: c.y, w: c.w, h: c.h, data: buffers[c.b] }]));
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
