// Thumbnails of animations stored on the board, rendered the way the panel shows them.
// Cached per name + size.

import { decodeDpa, decodeFirstFrame, type FirstFrame } from '../codec/dpa';
import { expand565Table } from '../color/rgb565';
import { device, type AnimFile } from './api';

const cache = new Map<string, Promise<string | null>>();

export function thumbnail(host: string, f: AnimFile): Promise<string | null> {
  const key = `${host}|${f.name}|${f.size}`;
  let p = cache.get(key);
  if (!p) {
    p = render(host, f).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

// Small files are decoded completely so the thumbnail can show the most characteristic pose:
// the frame held longest (animations such as the eye moods start from a neutral face).
const FULL_DECODE_MAX = 256 * 1024;

function representative(bytes: Uint8Array): FirstFrame | null {
  const d = decodeDpa(bytes);
  let k = 0;
  d.frames.forEach((fr, i) => {
    if (i > 0 && fr.pixels && fr.delay > d.frames[k].delay) k = i;
  });
  const pixels = d.frames[k].pixels;
  if (!pixels) return null;
  return { ...d, rect: { x: 0, y: 0, w: d.canvasW, h: d.canvasH }, pixels };
}

async function render(host: string, f: AnimFile): Promise<string | null> {
  let frame: FirstFrame | null = null;
  if (f.size <= FULL_DECODE_MAX) {
    try {
      frame = representative(await device.fileHead(host, f.name, f.size));
    } catch {
      frame = null;
    }
  }
  if (!frame) {
    let bytes = await device.fileHead(host, f.name, 65536);
    try {
      frame = decodeFirstFrame(bytes);
    } catch {
      if (bytes.length >= f.size) return null;
      bytes = await device.fileHead(host, f.name, f.size); // large first frame: fetch the whole file
      frame = decodeFirstFrame(bytes);
    }
  }
  const table = expand565Table();
  const canvas = new OffscreenCanvas(frame.screenW, frame.screenH);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const bg = frame.colorMode === 1 ? (frame.bgColor ? 0xffffff : 0) : table[frame.bgColor];
  ctx.fillStyle = '#' + bg.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, frame.screenW, frame.screenH);

  const { x, y } = frame.rect;
  const s = frame.scale;
  if (frame.pixels) {
    const img = new ImageData(frame.canvasW, frame.canvasH);
    for (let i = 0; i < frame.pixels.length; i++) {
      const c = table[frame.pixels[i]];
      img.data[i * 4] = c >> 16;
      img.data[i * 4 + 1] = (c >> 8) & 255;
      img.data[i * 4 + 2] = c & 255;
      img.data[i * 4 + 3] = 255;
    }
    const src = new OffscreenCanvas(frame.canvasW, frame.canvasH);
    src.getContext('2d')!.putImageData(img, 0, 0);
    ctx.drawImage(src, frame.offsetX, frame.offsetY, frame.canvasW * s, frame.canvasH * s);
  } else if (frame.jpeg) {
    const bmp = await createImageBitmap(new Blob([frame.jpeg as BlobPart], { type: 'image/jpeg' }));
    ctx.drawImage(bmp, frame.offsetX + x * s, frame.offsetY + y * s, bmp.width * s, bmp.height * s);
  }
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
}
