// DPA writer/reader. Format spec: docs/dpa-format.md

import { expand565Table, to565 } from '../color/rgb565';
import { toIndices, quantize } from '../color/quantize';
import { getPreset } from '../model/presets';
import { hexToRgb } from '../model/project';
import type { Project } from '../model/types';
import { isMono, processFrame } from '../render/output';
import { rleDecode, rleEncode } from './rle';

export const FRAME_INDEXED = 0;
export const FRAME_JPEG = 1;
export const FRAME_MONO = 2;
const HEADER_SIZE = 32;
const ENTRY_SIZE = 12;

export type OutputMode = 'indexed' | 'jpeg' | 'mono';

export interface EncodeResult {
  bytes: Uint8Array;
  mode: OutputMode;
  paletteSize: number;
  exactColors: boolean;
  frameSizes: number[];
}

interface EncodedFrame {
  type: number;
  key: boolean;
  delay: number;
  data: Uint8Array;
}

export function resolveMode(p: Project): OutputMode {
  if (isMono(p)) return 'mono';
  if (p.encoding !== 'auto') return p.encoding;
  return p.source === 'video' ? 'jpeg' : 'indexed';
}

export async function encodeDpa(p: Project, onProgress?: (done: number, total: number) => void): Promise<EncodeResult> {
  const mode = resolveMode(p);
  let palette: Uint16Array = new Uint16Array(0);
  let exactColors = true;
  let frames: EncodedFrame[];

  if (mode === 'mono') {
    frames = encodeMono(p);
  } else if (mode === 'indexed') {
    const px = p.frames.map((f) => (processFrame(p, f) as { px: Uint16Array }).px);
    const q = quantize(px, p.adjust.colors || 256);
    palette = q.palette;
    exactColors = q.exact || p.adjust.colors > 0;
    frames = encodeIndexed(p, px.map((f) => toIndices(f, q)));
  } else {
    frames = [];
    for (let i = 0; i < p.frames.length; i++) {
      frames.push(await encodeJpegFrame(p, i));
      onProgress?.(i + 1, p.frames.length);
    }
  }

  return {
    bytes: assemble(p, mode, palette, frames),
    mode,
    paletteSize: palette.length,
    exactColors,
    frameSizes: frames.map((f) => f.data.length),
  };
}

// Bounding box of differences between two equally sized arrays laid out as rows of `w` items.
function diffRect(a: Uint8Array | null, b: Uint8Array, w: number, h: number) {
  if (!a) return { x: 0, y: 0, w, h };
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (a[row + x] !== b[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(src: Uint8Array, stride: number, r: { x: number; y: number; w: number; h: number }): Uint8Array {
  const out = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) out.set(src.subarray((r.y + y) * stride + r.x, (r.y + y) * stride + r.x + r.w), y * r.w);
  return out;
}

function rectPayload(x: number, y: number, w: number, h: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  const v = new DataView(out.buffer);
  v.setUint16(0, x, true);
  v.setUint16(2, y, true);
  v.setUint16(4, w, true);
  v.setUint16(6, h, true);
  out.set(body, 8);
  return out;
}

function encodeIndexed(p: Project, indices: Uint8Array[]): EncodedFrame[] {
  return indices.map((cur, i) => {
    const r = diffRect(i === 0 ? null : indices[i - 1], cur, p.width, p.height);
    const body = r.w ? rleEncode(crop(cur, p.width, r)) : new Uint8Array(0);
    return { type: FRAME_INDEXED, key: i === 0, delay: p.frames[i].delay, data: rectPayload(r.x, r.y, r.w, r.h, body) };
  });
}

// 1-bit pixels -> SSD1306 page layout (pages of 8 rows, one byte per column, bit 0 = top).
export function toPages(bits: Uint8Array, w: number, h: number, padBit: number): Uint8Array {
  const pages = Math.ceil(h / 8);
  const out = new Uint8Array(pages * w);
  for (let p = 0; p < pages; p++)
    for (let x = 0; x < w; x++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) {
        const y = p * 8 + b;
        if (y < h ? bits[y * w + x] : padBit) byte |= 1 << b;
      }
      out[p * w + x] = byte;
    }
  return out;
}

function monoBgBit(p: Project): number {
  const [r, g, b] = hexToRgb(p.background);
  return (r * 77 + g * 150 + b * 29) >> 8 >= 128 ? 1 : 0;
}

function encodeMono(p: Project): EncodedFrame[] {
  const pages = Math.ceil(p.height / 8);
  const pad = monoBgBit(p);
  const all = p.frames.map((f) => toPages((processFrame(p, f) as { bits: Uint8Array }).bits, p.width, p.height, pad));
  return all.map((cur, i) => {
    const r = diffRect(i === 0 ? null : all[i - 1], cur, p.width, pages); // y/h in pages
    const body = r.w ? rleEncode(crop(cur, p.width, r)) : new Uint8Array(0);
    return { type: FRAME_MONO, key: i === 0, delay: p.frames[i].delay, data: rectPayload(r.x, r.y * 8, r.w, r.h * 8, body) };
  });
}

async function encodeJpegFrame(p: Project, i: number): Promise<EncodedFrame> {
  const px = (processFrame(p, p.frames[i]) as { px: Uint16Array }).px;
  const table = expand565Table();
  const img = new ImageData(p.width, p.height);
  for (let j = 0, o = 0; j < px.length; j++, o += 4) {
    const c = table[px[j]];
    img.data[o] = c >> 16;
    img.data[o + 1] = (c >> 8) & 255;
    img.data[o + 2] = c & 255;
    img.data[o + 3] = 255;
  }
  const canvas = new OffscreenCanvas(p.width, p.height);
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: p.jpegQuality });
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  return { type: FRAME_JPEG, key: true, delay: p.frames[i].delay, data: rectPayload(0, 0, p.width, p.height, jpeg) };
}

function assemble(p: Project, mode: OutputMode, palette: Uint16Array, frames: EncodedFrame[]): Uint8Array {
  const preset = getPreset(p.presetId);
  const tableOffset = HEADER_SIZE + palette.length * 2;
  let dataOffset = tableOffset + frames.length * ENTRY_SIZE;
  const total = dataOffset + frames.reduce((s, f) => s + f.data.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  const [br, bgc, bb] = hexToRgb(p.background);

  out.set([0x44, 0x50, 0x41, 0x31], 0); // "DPA1"
  v.setUint8(4, 1);
  v.setUint8(5, mode === 'mono' ? 1 : 0);
  v.setUint16(6, preset.width, true);
  v.setUint16(8, preset.height, true);
  v.setUint16(10, p.width, true);
  v.setUint16(12, p.height, true);
  v.setUint8(14, p.scale);
  v.setUint8(15, Math.min(255, Math.max(0, p.loop)));
  v.setInt16(16, p.offsetX, true);
  v.setInt16(18, p.offsetY, true);
  v.setUint16(20, frames.length, true);
  v.setUint16(22, palette.length, true);
  v.setUint16(24, mode === 'mono' ? monoBgBit(p) : to565(br, bgc, bb), true);
  v.setUint16(26, 0, true);
  v.setUint32(28, tableOffset, true);
  palette.forEach((c, i) => v.setUint16(HEADER_SIZE + i * 2, c, true));

  frames.forEach((f, i) => {
    const e = tableOffset + i * ENTRY_SIZE;
    v.setUint32(e, dataOffset, true);
    v.setUint32(e + 4, f.data.length, true);
    v.setUint16(e + 8, Math.min(65535, Math.max(1, Math.round(f.delay))), true);
    v.setUint8(e + 10, f.type);
    v.setUint8(e + 11, f.key ? 1 : 0);
    out.set(f.data, dataOffset);
    dataOffset += f.data.length;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Reader (tests and file inspection). Reconstructs INDEXED / MONO frames at canvas resolution.

export interface DecodedDpa {
  colorMode: number;
  screenW: number;
  screenH: number;
  canvasW: number;
  canvasH: number;
  scale: number;
  loop: number;
  offsetX: number;
  offsetY: number;
  bgColor: number;
  palette: Uint16Array;
  frames: { type: number; key: boolean; delay: number; size: number; pixels: Uint16Array | null }[];
}

export function decodeDpa(bytes: Uint8Array): DecodedDpa {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'DPA1') throw new Error('not a DPA file');
  const d: DecodedDpa = {
    colorMode: v.getUint8(5),
    screenW: v.getUint16(6, true),
    screenH: v.getUint16(8, true),
    canvasW: v.getUint16(10, true),
    canvasH: v.getUint16(12, true),
    scale: v.getUint8(14),
    loop: v.getUint8(15),
    offsetX: v.getInt16(16, true),
    offsetY: v.getInt16(18, true),
    bgColor: v.getUint16(24, true),
    palette: new Uint16Array(v.getUint16(22, true)),
    frames: [],
  };
  d.palette.forEach((_, i) => (d.palette[i] = v.getUint16(HEADER_SIZE + i * 2, true)));
  const count = v.getUint16(20, true);
  const table = v.getUint32(28, true);
  const { canvasW: w, canvasH: h } = d;
  const canvas = new Uint16Array(w * h); // current state, RGB565 (mono: 0 / 0xFFFF)

  for (let i = 0; i < count; i++) {
    const e = table + i * ENTRY_SIZE;
    const off = v.getUint32(e, true), size = v.getUint32(e + 4, true);
    const type = v.getUint8(e + 10);
    const rx = v.getUint16(off, true), ry = v.getUint16(off + 2, true);
    const rw = v.getUint16(off + 4, true), rh = v.getUint16(off + 6, true);
    const body = bytes.subarray(off + 8, off + size);
    let pixels: Uint16Array | null = null;
    if (type === FRAME_INDEXED) {
      if (rw) {
        const idx = rleDecode(body, rw * rh);
        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) canvas[(ry + y) * w + rx + x] = d.palette[idx[y * rw + x]];
      }
      pixels = canvas.slice();
    } else if (type === FRAME_MONO) {
      if (rw) {
        const pages = rleDecode(body, rw * (rh / 8));
        for (let p = 0; p < rh / 8; p++)
          for (let x = 0; x < rw; x++)
            for (let b = 0; b < 8; b++) {
              const y = ry + p * 8 + b;
              if (y < h) canvas[y * w + rx + x] = (pages[p * rw + x] >> b) & 1 ? 0xffff : 0;
            }
      }
      pixels = canvas.slice();
    }
    d.frames.push({ type, key: (v.getUint8(e + 11) & 1) === 1, delay: v.getUint16(e + 8, true), size, pixels });
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// First frame only, from a possibly truncated file (thumbnails of files on the board).

export interface FirstFrame {
  colorMode: number;
  screenW: number;
  screenH: number;
  canvasW: number;
  canvasH: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  bgColor: number;
  rect: { x: number; y: number; w: number; h: number };
  pixels?: Uint16Array; // INDEXED / MONO: canvas-sized RGB565 (mono: 0 / 0xFFFF)
  jpeg?: Uint8Array; // JPEG frame data
}

export function decodeFirstFrame(bytes: Uint8Array): FirstFrame {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < HEADER_SIZE || String.fromCharCode(...bytes.subarray(0, 4)) !== 'DPA1') throw new Error('not a DPA file');
  const canvasW = v.getUint16(10, true), canvasH = v.getUint16(12, true);
  const paletteSize = v.getUint16(22, true);
  const table = v.getUint32(28, true);
  const off = v.getUint32(table, true), size = v.getUint32(table + 4, true);
  const type = v.getUint8(table + 10);
  if (off + size > bytes.length) throw new Error('first frame not in the downloaded range');
  const rect = { x: v.getUint16(off, true), y: v.getUint16(off + 2, true), w: v.getUint16(off + 4, true), h: v.getUint16(off + 6, true) };
  const body = bytes.subarray(off + 8, off + size);
  const f: FirstFrame = {
    colorMode: v.getUint8(5), screenW: v.getUint16(6, true), screenH: v.getUint16(8, true), canvasW, canvasH,
    scale: v.getUint8(14), offsetX: v.getInt16(16, true), offsetY: v.getInt16(18, true), bgColor: v.getUint16(24, true), rect,
  };
  if (type === FRAME_JPEG) {
    f.jpeg = body.slice();
  } else if (type === FRAME_INDEXED) {
    const palette = new Uint16Array(paletteSize);
    for (let i = 0; i < paletteSize; i++) palette[i] = v.getUint16(HEADER_SIZE + i * 2, true);
    const px = new Uint16Array(canvasW * canvasH);
    const idx = rleDecode(body, rect.w * rect.h);
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) px[(rect.y + y) * canvasW + rect.x + x] = palette[idx[y * rect.w + x]];
    f.pixels = px;
  } else if (type === FRAME_MONO) {
    const px = new Uint16Array(canvasW * canvasH);
    const pages = rleDecode(body, rect.w * (rect.h / 8));
    for (let p = 0; p < rect.h / 8; p++)
      for (let x = 0; x < rect.w; x++)
        for (let b = 0; b < 8; b++) {
          const y = rect.y + p * 8 + b;
          if (y < canvasH) px[y * canvasW + rect.x + x] = (pages[p * rect.w + x] >> b) & 1 ? 0xffff : 0;
        }
    f.pixels = px;
  }
  return f;
}
