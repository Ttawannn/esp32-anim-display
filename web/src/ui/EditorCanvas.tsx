import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  ellipse, floodFill, getPixel, hexToRgba, line, rect, shifted, TRANSPARENT,
  type RGBA, type Surface,
} from '../editor/tools';
import { usesSeconds } from '../layers/clock';
import { clockOverlay } from '../layers/preview';
import { stickerBitmap, type Bitmap } from '../layers/raster';
import { addLayer, INSERT_MIME, layerBounds, layersOf, updateLayer, type InsertItem } from '../model/layers';
import { getPreset } from '../model/presets';
import { rgbToHex } from '../model/project';
import { setFrameData, store, type EditorState } from '../model/store';
import type { Layer, Pixels } from '../model/types';
import { IconButton } from './common';
import { frameFactor, ModuleFrame } from './ModuleFrame';
import { t } from '../i18n';

interface Stroke {
  base: Pixels; // frame before the stroke
  work: Pixels; // frame being drawn
  color: RGBA;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  changed: boolean;
}

// Dragging a layer with the select tool (positions in canvas pixels, fractional).
interface LayerDrag {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  layer: Layer;
  bounds: { x: number; y: number; w: number; h: number };
  moved: boolean;
}

const bitmapCanvases = new WeakMap<Bitmap, OffscreenCanvas>();
function bitmapCanvas(b: Bitmap): OffscreenCanvas {
  let c = bitmapCanvases.get(b);
  if (!c) {
    c = new OffscreenCanvas(b.w, b.h);
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.w, b.h), 0, 0);
    bitmapCanvases.set(b, c);
  }
  return c;
}

const HANDLE = 10; // resize handle size, screen pixels

export function EditorCanvas({ s }: { s: EditorState }) {
  const { project: p, frameIndex, zoom, grid, onion, tool } = s;
  const frame = p.frames[frameIndex];
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Stroke | null>(null);
  const drag = useRef<LayerDrag | null>(null);
  const [fitZoom, setFitZoom] = useState(4);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [, setTick] = useState(0);
  const z = zoom || fitZoom;
  const layers = layersOf(p);
  const hasClock = layers.some((l) => l.kind === 'clock');
  const seconds = layers.some((l) => l.kind === 'clock' && usesSeconds(l.format));

  // Auto zoom: largest integer zoom that fits the stage.
  useLayoutEffect(() => {
    const el = stageRef.current!;
    // The module frame is drawn around the screen, so fit the whole module.
    const update = () => {
      const screen = getPreset(p.presetId);
      const { fx, fy } = frameFactor(p.presetId);
      const fz = Math.floor(Math.min(((el.clientWidth - 40) * p.scale) / (screen.width * fx), ((el.clientHeight - 90) * p.scale) / (screen.height * fy)));
      setFitZoom(Math.max(1, Math.min(40, fz)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.width, p.height, p.presetId, p.scale]);

  // Clocks show the real time while editing.
  useEffect(() => {
    if (!hasClock) return;
    const t = setInterval(() => setTick((n) => n + 1), seconds ? 1000 : 15000);
    return () => clearInterval(t);
  }, [hasClock, seconds]);

  const drawLayers = (ctx: CanvasRenderingContext2D) => {
    ctx.imageSmoothingEnabled = false;
    for (const l of layers) {
      if (l.kind !== 'sticker') continue;
      const b = stickerBitmap(l);
      if (b) ctx.drawImage(bitmapCanvas(b), Math.round(l.x) * z, Math.round(l.y) * z, b.w * z, b.h * z);
    }
    if (hasClock) {
      const preset = getPreset(p.presetId);
      const overlay = clockOverlay(p, preset.width, preset.height);
      if (overlay) {
        const k = z / p.scale;
        ctx.imageSmoothingEnabled = k < 1;
        ctx.drawImage(overlay, -p.offsetX * k, -p.offsetY * k, preset.width * k, preset.height * k);
        ctx.imageSmoothingEnabled = false;
      }
    }
  };

  const drawSelection = (ctx: CanvasRenderingContext2D) => {
    const sel = layers.find((l) => l.id === s.selectedLayer);
    if (!sel || tool !== 'select') return;
    const b = layerBounds(p, sel);
    const x = b.x * z, y = b.y * z, w = b.w * z, h = b.h * z;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#4f8cff';
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#4f8cff';
    ctx.beginPath();
    ctx.rect(x + w + 2 - HANDLE / 2, y + h + 2 - HANDLE / 2, HANDLE, HANDLE);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const draw = (data: Pixels) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    const img = new OffscreenCanvas(p.width, p.height);
    img.getContext('2d')!.putImageData(new ImageData(data, p.width, p.height), 0, 0);
    ctx.drawImage(img, 0, 0, p.width * z, p.height * z);
    if (onion && frameIndex > 0) {
      const prev = new OffscreenCanvas(p.width, p.height);
      prev.getContext('2d')!.putImageData(new ImageData(p.frames[frameIndex - 1].data, p.width, p.height), 0, 0);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(prev, 0, 0, p.width * z, p.height * z);
      ctx.globalAlpha = 1;
    }
    drawLayers(ctx);
    if (grid && z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < p.width; x++) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, p.height * z); }
      for (let y = 1; y < p.height; y++) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(p.width * z, y * z + 0.5); }
      ctx.stroke();
    }
    if (hover && tool !== 'move' && tool !== 'select') {
      const size = tool === 'pencil' || tool === 'eraser' ? s.brush : 1;
      const o = Math.floor((size - 1) / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeRect((hover.x - o) * z + 0.5, (hover.y - o) * z + 0.5, size * z - 1, size * z - 1);
    }
    drawSelection(ctx);
  };

  useEffect(() => {
    if (!stroke.current) draw(frame.data);
  });

  const toPoint = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  };
  const toCell = (e: PointerEvent) => {
    const pt = toPoint(e);
    return { x: Math.floor(pt.x), y: Math.floor(pt.y) };
  };

  const surface = (data: Pixels): Surface => ({ data, w: p.width, h: p.height, mirror: s.mirror });

  const apply = (st: Stroke, x: number, y: number) => {
    switch (tool) {
      case 'pencil':
      case 'eraser':
        line(surface(st.work), st.lastX, st.lastY, x, y, st.color, s.brush);
        break;
      case 'line':
      case 'rect':
      case 'ellipse': {
        st.work.set(st.base);
        const surf = surface(st.work);
        if (tool === 'line') line(surf, st.startX, st.startY, x, y, st.color);
        else if (tool === 'rect') rect(surf, st.startX, st.startY, x, y, st.color, s.filled);
        else ellipse(surf, st.startX, st.startY, x, y, st.color, s.filled);
        break;
      }
      case 'move':
        st.work.set(shifted(st.base, p.width, p.height, x - st.startX, y - st.startY));
        break;
    }
    st.lastX = x;
    st.lastY = y;
    st.changed = true;
  };

  // Topmost layer under the point, and whether the point is on the selected layer's resize handle.
  const hitLayer = (pt: { x: number; y: number }) => {
    const sel = layers.find((l) => l.id === s.selectedLayer);
    if (sel) {
      const b = layerBounds(p, sel);
      const hx = b.x + b.w + 2 / z, hy = b.y + b.h + 2 / z, r = HANDLE / z;
      if (Math.abs(pt.x - hx) <= r && Math.abs(pt.y - hy) <= r) return { layer: sel, mode: 'resize' as const, bounds: b };
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const b = layerBounds(p, layers[i]);
      const pad = 3 / z;
      if (pt.x >= b.x - pad && pt.y >= b.y - pad && pt.x <= b.x + b.w + pad && pt.y <= b.y + b.h + pad) {
        return { layer: layers[i], mode: 'move' as const, bounds: b };
      }
    }
    return null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    if (store.state.playing) store.set({ playing: false });

    if (tool === 'select') {
      const pt = toPoint(e);
      const hit = hitLayer(pt);
      if (!hit) {
        store.set({ selectedLayer: null });
        return;
      }
      store.set({ selectedLayer: hit.layer.id, sideTab: 'insert' });
      canvasRef.current!.setPointerCapture(e.pointerId);
      drag.current = { id: hit.layer.id, mode: hit.mode, startX: pt.x, startY: pt.y, layer: hit.layer, bounds: hit.bounds, moved: false };
      return;
    }

    const { x, y } = toCell(e);
    const secondary = e.button === 2;
    const hex = secondary ? s.secondary : s.primary;
    const color = tool === 'eraser' ? TRANSPARENT : hexToRgba(hex);

    if (tool === 'picker') {
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
      const [r, g, b, a] = getPixel(frame.data, p.width, x, y);
      if (a) store.set(secondary ? { secondary: rgbToHex(r, g, b) } : { primary: rgbToHex(r, g, b), tool: 'pencil' });
      return;
    }
    if (tool === 'fill') {
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
      const work = frame.data.slice();
      floodFill(surface(work), x, y, color);
      setFrameData(frameIndex, work);
      return;
    }
    canvasRef.current!.setPointerCapture(e.pointerId);
    const st: Stroke = { base: frame.data, work: frame.data.slice(), color, startX: x, startY: y, lastX: x, lastY: y, changed: false };
    stroke.current = st;
    apply(st, x, y);
    draw(st.work);
  };

  const dragLayer = (d: LayerDrag, pt: { x: number; y: number }) => {
    const dx = pt.x - d.startX, dy = pt.y - d.startY;
    const l = d.layer;
    if (d.mode === 'move') {
      if (l.kind === 'sticker') updateLayer(d.id, { x: Math.round(l.x + dx), y: Math.round(l.y + dy) }, true);
      else updateLayer(d.id, { x: Math.round(l.x + dx * p.scale), y: Math.round(l.y + dy * p.scale) }, true);
    } else {
      // Resize from the bottom-right corner, keeping the top-left in place.
      const factor = Math.max(0.1, Math.max((d.bounds.w + dx) / d.bounds.w, (d.bounds.h + dy) / d.bounds.h));
      const max = l.kind === 'sticker' ? Math.max(p.width, p.height) * 2 : getPreset(p.presetId).height;
      updateLayer(d.id, { size: Math.max(6, Math.min(max, Math.round(l.size * factor))) }, true);
    }
    d.moved = true;
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) {
      dragLayer(d, toPoint(e));
      return;
    }
    const cell = toCell(e);
    const st = stroke.current;
    if (st) {
      if (cell.x !== st.lastX || cell.y !== st.lastY) {
        apply(st, cell.x, cell.y);
        draw(st.work);
      }
    } else if (!hover || hover.x !== cell.x || hover.y !== cell.y) {
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < p.width && cell.y < p.height;
      setHover(inside ? cell : null);
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d) {
      if (d.moved) store.endLive();
      return;
    }
    const st = stroke.current;
    stroke.current = null;
    if (st?.changed) setFrameData(frameIndex, st.work);
  };

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    store.set({ zoom: Math.max(1, Math.min(40, z + (e.deltaY < 0 ? 1 : -1))) });
  };

  // Drag & drop from the insert panel.
  const accepts = (e: DragEvent) => !!e.dataTransfer?.types.includes(INSERT_MIME);
  const onDragOver = (e: DragEvent) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    if (!dropping) setDropping(true);
  };
  const onDrop = (e: DragEvent) => {
    setDropping(false);
    if (!accepts(e)) return;
    e.preventDefault();
    const item = JSON.parse(e.dataTransfer!.getData(INSERT_MIME)) as InsertItem;
    addLayer(item, toPoint(e));
  };

  const preset = getPreset(p.presetId);
  const fitsExactly = p.width * p.scale === preset.width && p.height * p.scale === preset.height;
  const cursor = tool === 'move' ? 'move' : tool === 'select' ? 'default' : 'crosshair';

  return (
    <div class={`stage${dropping ? ' dropping' : ''}`} ref={stageRef} onWheel={onWheel}
      onDragOver={onDragOver} onDragLeave={(e) => e.target === stageRef.current && setDropping(false)} onDrop={onDrop}>
      <div class="stage-bar">
        <IconButton icon="zoomOut" title={t('Zoom out')} onClick={() => store.set({ zoom: Math.max(1, z - 1) })} />
        <button class={`btn${zoom === 0 ? ' active' : ''}`} onClick={() => store.set({ zoom: 0 })} title={t('Fit to view')}>
          {z}×
        </button>
        <IconButton icon="zoomIn" title={t('Zoom in')} onClick={() => store.set({ zoom: Math.min(40, z + 1) })} />
      </div>
      <ModuleFrame presetId={p.presetId} screenW={preset.width * (z / p.scale)} screenH={preset.height * (z / p.scale)} background={p.background}>
      <canvas
        class="edit"
        style={{ cursor, position: 'absolute', left: p.offsetX * (z / p.scale), top: p.offsetY * (z / p.scale) }}
        ref={canvasRef}
        width={p.width * z}
        height={p.height * z}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
      </ModuleFrame>
      {dropping && <div class="drop-hint">{t('Drop to place it here')}</div>}
      <div class="meta">
        {t('Image')} {p.width}×{p.height}
        {p.scale > 1 && <> · {t('enlarged ×{k}', { k: p.scale })}</>} → {t('screen')} {preset.width}×{preset.height}
        {!fitsExactly && <> · {t('margin')} {p.offsetX},{p.offsetY}</>}
        {hover && tool !== 'select' && <> · ({hover.x}, {hover.y})</>}
        {tool === 'select' && <> · {t('drag to move · drag the bottom-right corner to resize')}</>}
      </div>
    </div>
  );
}
