// Layer actions: add from the insert panel (click or drag & drop), move, resize, edit, bake;
// paint layers: lift a drawing into an object, draw on it, merge it back.

import { parseFormat, usesSeconds } from '../layers/clock';
import { celRect, compositeCel, flipCel, liftPixels, type Box } from '../layers/paint';
import { composite, stickerBitmap, widgetsFor } from '../layers/raster';
import { getPreset } from './presets';
import { store, toast } from './store';
import type { Cel, ClockLayer, Frame, Layer, PaintLayer, Project, StickerLayer } from './types';
import { t } from '../i18n';

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

// The paint layer that drawing tools work on (null = the background drawing).
export function paintTarget(p: Project, selected: string | null): PaintLayer | null {
  const l = selected ? layersOf(p).find((x) => x.id === selected) : undefined;
  return l?.kind === 'paint' ? l : null;
}

export function withCel(f: Frame, id: string, cel: Cel | null): Frame {
  const cels = { ...f.cels };
  if (cel) cels[id] = cel;
  else delete cels[id];
  return { ...f, cels: Object.keys(cels).length ? cels : undefined };
}

// Screen area of the canvas (clocks are drawn only there).
export function canvasScreenRect(p: Project) {
  return { x: p.offsetX, y: p.offsetY, w: p.width * p.scale, h: p.height * p.scale };
}

function union(a: Box | null, b: Box): Box {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// Layer bounds in canvas pixels (clocks converted from screen pixels). Paint layers use their pixels
// on the given frame, or on all frames when that frame has none.
export function layerBounds(p: Project, l: Layer, frameIndex = store.state.frameIndex): Box {
  if (l.kind === 'paint') {
    const cel = p.frames[frameIndex]?.cels?.[l.id];
    if (cel) return celRect(l, cel);
    let box: Box | null = null;
    for (const f of p.frames) if (f.cels?.[l.id]) box = union(box, celRect(l, f.cels[l.id]));
    return box ?? { x: l.x, y: l.y, w: 4 * l.scale, h: 4 * l.scale };
  }
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
      : { type: 'text', text: t('Hello'), font: 'sans', bold: true },
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
    toast(t('Up to {n} clocks/dates per animation', { n: 8 }), true);
    return;
  }
  const layer = centreAt(p, makeLayer(p, item), at?.x ?? p.width / 2, at?.y ?? p.height / 2);
  store.commit({ ...p, layers: [...layersOf(p), layer] });
  store.set({ selectedLayer: layer.id, tool: 'select', sideTab: 'insert', playing: false });
}

export function updateLayer(id: string, patch: Partial<StickerLayer> | Partial<ClockLayer> | Partial<PaintLayer>, live = false) {
  const p = store.state.project;
  const layers = layersOf(p).map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l));
  const next = { ...p, layers };
  if (live) store.setLive(next);
  else store.commit(next);
}

// Frames without the paint layer's cels.
function dropCels(p: Project, id: string): Frame[] {
  return p.frames.map((f) => (f.cels?.[id] ? withCel(f, id, null) : f));
}

export function removeLayer(id: string) {
  const p = store.state.project;
  store.commit({ ...p, frames: dropCels(p, id), layers: layersOf(p).filter((l) => l.id !== id) });
  if (store.state.selectedLayer === id) store.set({ selectedLayer: null });
}

export function duplicateLayer(id: string) {
  const p = store.state.project;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l) return;
  const step = l.kind === 'clock' ? 4 * p.scale : 4;
  const copy = { ...l, id: newId(), x: l.x + step, y: l.y + step } as Layer;
  if (copy.kind === 'paint') copy.name = `${copy.name} 2`;
  const frames = l.kind !== 'paint' ? p.frames
    : p.frames.map((f) => (f.cels?.[l.id] ? withCel(f, copy.id, f.cels[l.id]) : f));
  const layers = layersOf(p).slice();
  layers.splice(layers.indexOf(l) + 1, 0, copy);
  store.commit({ ...p, frames, layers });
  store.set({ selectedLayer: copy.id });
}

export function moveLayerOrder(id: string, toFront: boolean) {
  const p = store.state.project;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l) return;
  const rest = layersOf(p).filter((x) => x.id !== id);
  store.commit({ ...p, layers: toFront ? [...rest, l] : [l, ...rest] });
}

// Paints a sticker or paint layer into the background drawing for good (this frame or all). A
// sticker is then removed; a paint layer loses this frame's pixels, or goes when merged everywhere.
export function bakeLayer(id: string, allFrames: boolean) {
  const { project: p, frameIndex } = store.state;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l || l.kind === 'clock') return;
  const b = l.kind === 'sticker' ? stickerBitmap(l) : null;
  if (l.kind === 'sticker' && !b) return;
  const frames = p.frames.map((f, i) => {
    if (!allFrames && i !== frameIndex) return f;
    if (l.kind === 'paint') {
      const cel = f.cels?.[l.id];
      if (!cel) return f;
      const data = f.data.slice();
      compositeCel(data, p.width, p.height, l, cel);
      return withCel({ ...f, data }, l.id, null);
    }
    const data = f.data.slice();
    composite(data, p.width, p.height, b!, Math.round(l.x), Math.round(l.y));
    return { ...f, data };
  });
  const keep = l.kind === 'paint' && !allFrames;
  store.commit({ ...p, frames, layers: keep ? layersOf(p) : layersOf(p).filter((x) => x.id !== id) });
  if (!keep) store.set({ selectedLayer: null });
  toast(allFrames ? t('Stamped onto every frame') : t('Stamped onto this frame'));
}

function nextLayerName(p: Project): string {
  const n = layersOf(p).filter((l) => l.kind === 'paint').length + 1;
  return t('Layer {n}', { n });
}

// A new, empty paint layer above the others (below clocks), selected for drawing.
export function addPaintLayer() {
  const p = store.state.project;
  const layer: PaintLayer = { kind: 'paint', id: newId(), name: nextLayerName(p), x: 0, y: 0, scale: 1 };
  const layers = layersOf(p).slice();
  const firstClock = layers.findIndex((l) => l.kind === 'clock');
  layers.splice(firstClock < 0 ? layers.length : firstClock, 0, layer);
  store.commit({ ...p, layers });
  const tool = store.state.tool === 'select' ? 'pencil' : store.state.tool;
  store.set({ selectedLayer: layer.id, sideTab: 'layers', playing: false, tool });
}

// Moves the background drawing inside `rect` (canvas pixels; null = everything) into a new paint
// layer, on this frame or every frame. Returns false when there was nothing to take.
export function liftToLayer(rect: Box | null, allFrames: boolean): boolean {
  const { project: p, frameIndex } = store.state;
  const area = rect ?? { x: 0, y: 0, w: p.width, h: p.height };
  const lifted = p.frames.map((f, i) => (allFrames || i === frameIndex ? liftPixels(f.data, p.width, p.height, area) : null));
  let box: Box | null = null;
  for (const r of lifted) if (r?.cel) box = union(box, r.cel);
  if (!box) {
    toast(t('Nothing drawn there to lift'), true);
    return false;
  }
  const o = box;
  const layer: PaintLayer = { kind: 'paint', id: newId(), name: nextLayerName(p), x: o.x, y: o.y, scale: 1 };
  const frames = p.frames.map((f, i) => {
    const r = lifted[i];
    if (!r?.cel) return f;
    return withCel({ ...f, data: r.rest }, layer.id, { ...r.cel, x: r.cel.x - o.x, y: r.cel.y - o.y });
  });
  // Just above the background, so it stays under the stickers it was under before.
  store.commit({ ...p, frames, layers: [layer, ...layersOf(p)] });
  store.set({ selectedLayer: layer.id, tool: 'select', sideTab: 'layers', playing: false });
  toast(t('Turned into an object: drag to move, drag the corner to resize'));
  return true;
}

export function setCel(frameIndex: number, id: string, cel: Cel | null, live = false) {
  const p = store.state.project;
  const frames = p.frames.slice();
  frames[frameIndex] = withCel(frames[frameIndex], id, cel);
  if (live) store.setLive({ ...p, frames });
  else store.commit({ ...p, frames }, frameIndex);
}

// Sets a paint layer's scale, keeping the top-left corner of its pixels on this frame in place.
export function scaleLayer(id: string, scale: number, live = false, from?: { layer: PaintLayer; bounds: Box }) {
  const p = store.state.project;
  const l = from?.layer ?? layersOf(p).find((x): x is PaintLayer => x.id === id && x.kind === 'paint');
  if (!l) return;
  const b = from?.bounds ?? layerBounds(p, l);
  scale = Math.max(0.25, Math.min(16, scale));
  // The box's corner sits at layer pixel (b.x - l.x) / l.scale.
  const x = Math.round(b.x - ((b.x - l.x) / l.scale) * scale), y = Math.round(b.y - ((b.y - l.y) / l.scale) * scale);
  updateLayer(id, { scale, x, y }, live);
}

// Flips the paint layer's pixels on the current frame around their own centre.
export function flipLayer(id: string, horizontal: boolean) {
  const { project: p, frameIndex } = store.state;
  const cel = p.frames[frameIndex].cels?.[id];
  if (cel) setCel(frameIndex, id, flipCel(cel, horizontal));
}

export function nudgeLayer(id: string, dx: number, dy: number) {
  const p = store.state.project;
  const l = layersOf(p).find((x) => x.id === id);
  if (!l) return;
  const k = l.kind === 'clock' ? p.scale : 1;
  updateLayer(id, { x: l.x + dx * k, y: l.y + dy * k });
}
