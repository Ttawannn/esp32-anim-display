// Layer actions: add from the insert panel (click or drag & drop), move, resize, edit, bake.

import { parseFormat, usesSeconds } from '../layers/clock';
import { composite, stickerBitmap, widgetsFor } from '../layers/raster';
import { getPreset } from './presets';
import { store, toast } from './store';
import type { ClockLayer, Layer, Project, StickerLayer } from './types';

export type InsertItem =
  | { type: 'emoji'; char: string }
  | { type: 'icon'; name: string }
  | { type: 'text' }
  | { type: 'clock'; format: string };

export const INSERT_MIME = 'application/x-display-editor-insert';

const newId = () => Math.random().toString(36).slice(2, 10);

export function layersOf(p: Project): Layer[] {
  return p.layers ?? [];
}

export function selectedLayer(): Layer | null {
  const id = store.state.selectedLayer;
  return (id && layersOf(store.state.project).find((l) => l.id === id)) || null;
}

// Screen area of the canvas (clocks are drawn only there).
export function canvasScreenRect(p: Project) {
  return { x: p.offsetX, y: p.offsetY, w: p.width * p.scale, h: p.height * p.scale };
}

// Layer bounds in canvas pixels (clocks converted from screen pixels).
export function layerBounds(p: Project, l: Layer): { x: number; y: number; w: number; h: number } {
  if (l.kind === 'sticker') {
    const b = stickerBitmap(l);
    return { x: l.x, y: l.y, w: b?.w ?? l.size, h: b?.h ?? l.size };
  }
  const w = widgetsFor(p);
  const i = w?.layers.findIndex((c) => c.id === l.id) ?? -1;
  const box = i >= 0 ? w!.boxes[i] : { x: l.x, y: l.y, w: l.size * 3, h: l.size };
  return { x: (box.x - p.offsetX) / p.scale, y: (box.y - p.offsetY) / p.scale, w: box.w / p.scale, h: box.h / p.scale };
}

function defaultClockSize(p: Project, format: string): number {
  const s = getPreset(p.presetId);
  const time = parseFormat(format).some((x) => x.kind === 'number' && (x.field === 'hour' || x.field === 'hour12'));
  const big = Math.min(s.height * 0.4, s.width * (usesSeconds(format) ? 0.14 : 0.2));
  return Math.max(8, Math.round(time ? big : big * 0.55));
}

function makeLayer(p: Project, item: InsertItem): Layer {
  const mono = getPreset(p.presetId).color === 'mono';
  if (item.type === 'clock') {
    return {
      kind: 'clock', id: newId(), x: p.offsetX, y: p.offsetY, size: defaultClockSize(p, item.format),
      color: '#ffffff', font: 'sans', bold: true, align: 'center', format: item.format,
    };
  }
  const size = Math.max(8, Math.round(Math.min(p.width, p.height) * (item.type === 'text' ? 0.22 : 0.35)));
  return {
    kind: 'sticker', id: newId(), x: 0, y: 0, size,
    color: mono ? '#ffffff' : item.type === 'icon' ? '#ffcc00' : '#ffffff',
    outline: false, crisp: p.scale >= 3 || mono,
    source: item.type === 'emoji' ? { type: 'emoji', char: item.char }
      : item.type === 'icon' ? { type: 'icon', name: item.name }
      : { type: 'text', text: 'สวัสดี', font: 'sans', bold: true },
  };
}

// Centres the layer on (cx, cy) in canvas pixels, keeping it on the canvas where possible.
function centreAt(p: Project, l: Layer, cx: number, cy: number): Layer {
  const probe = { ...p, layers: [...layersOf(p), l] };
  const b = layerBounds(probe, l);
  let x = cx - b.w / 2, y = cy - b.h / 2;
  x = Math.max(0, Math.min(p.width - b.w, x));
  y = Math.max(0, Math.min(p.height - b.h, y));
  if (l.kind === 'sticker') return { ...l, x: Math.round(x), y: Math.round(y) };
  return { ...l, x: Math.round(p.offsetX + x * p.scale), y: Math.round(p.offsetY + y * p.scale) };
}

export function addLayer(item: InsertItem, at?: { x: number; y: number }) {
  const p = store.state.project;
  if (item.type === 'clock' && layersOf(p).filter((l) => l.kind === 'clock').length >= 8) {
    toast('ใส่นาฬิกา/วันที่ได้สูงสุด 8 อัน', true);
    return;
  }
  const layer = centreAt(p, makeLayer(p, item), at?.x ?? p.width / 2, at?.y ?? p.height / 2);
  store.commit({ ...p, layers: [...layersOf(p), layer] });
  store.set({ selectedLayer: layer.id, tool: 'select', sideTab: 'insert', playing: false });
}

export function updateLayer(id: string, patch: Partial<StickerLayer> | Partial<ClockLayer>, live = false) {
  const p = store.state.project;
  const layers = layersOf(p).map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l));
  const next = { ...p, layers };
  if (live) store.setLive(next);
  else store.commit(next);
}

export function removeLayer(id: string) {
  const p = store.state.project;
  store.commit({ ...p, layers: layersOf(p).filter((l) => l.id !== id) });
  if (store.state.selectedLayer === id) store.set({ selectedLayer: null });
}

export function duplicateLayer(id: string) {
  const p = store.state.project;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l) return;
  const step = l.kind === 'clock' ? 4 * p.scale : 4;
  const copy = { ...l, id: newId(), x: l.x + step, y: l.y + step } as Layer;
  store.commit({ ...p, layers: [...layersOf(p), copy] });
  store.set({ selectedLayer: copy.id });
}

export function moveLayerOrder(id: string, toFront: boolean) {
  const p = store.state.project;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l) return;
  const rest = layersOf(p).filter((x) => x.id !== id);
  store.commit({ ...p, layers: toFront ? [...rest, l] : [l, ...rest] });
}

// Paints a sticker into the frame pixels for good (this frame or all), then removes the layer.
export function bakeLayer(id: string, allFrames: boolean) {
  const { project: p, frameIndex } = store.state;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l || l.kind !== 'sticker') return;
  const b = stickerBitmap(l);
  if (!b) return;
  const frames = p.frames.map((f, i) => {
    if (!allFrames && i !== frameIndex) return f;
    const data = f.data.slice();
    composite(data, p.width, p.height, b, Math.round(l.x), Math.round(l.y));
    return { ...f, data };
  });
  store.commit({ ...p, frames, layers: layersOf(p).filter((x) => x.id !== id) });
  store.set({ selectedLayer: null });
  toast(allFrames ? 'ปักลงทุกเฟรมแล้ว' : 'ปักลงเฟรมนี้แล้ว');
}

export function nudgeLayer(id: string, dx: number, dy: number) {
  const p = store.state.project;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l) return;
  const k = l.kind === 'clock' ? p.scale : 1;
  updateLayer(id, { x: l.x + dx * k, y: l.y + dy * k });
}
