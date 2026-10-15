import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  ellipse, floodFill, getPixel, hexToRgba, line, rect, shifted, TRANSPARENT,
  type RGBA, type Surface,
} from '../editor/tools';
import { clockTimeOf, usesSeconds } from '../layers/clock';
import { celAlphaAt, celInto, toLayer, trimCel, type Box } from '../layers/paint';
import { clockOverlay } from '../layers/preview';
import { bakeLayers } from '../layers/raster';
import {
  addLayer, INSERT_MIME, layerBounds, layersOf, liftToLayer, paintTarget, rasterizeSticker, scaleLayer, setCel, updateLayer, withCel,
  type InsertItem,
} from '../model/layers';
import { getPreset } from '../model/presets';
import { rgbToHex } from '../model/project';
import { isMono, processFrame } from '../render/output';
import { monoCanvasImage, oledScreenColor } from '../render/screen';
import { setFrameData, store, toast, type EditorState } from '../model/store';
import type { Cel, Frame, Layer, PaintLayer, Pixels } from '../model/types';
import { IconButton } from './common';
import { layerLabel } from './InsertPanel';
import { frameFactor, ModuleFrame } from './ModuleFrame';
import { t } from '../i18n';

// Pixels being drawn: the background frame, or a paint layer's cel expanded to cover the canvas.
interface Stroke {
  base: Pixels; // pixels before the stroke
  work: Pixels; // pixels being drawn
  color: RGBA;
  startX: number; // canvas cells
  startY: number;
  lastX: number;
  lastY: number;
  changed: boolean;
  layer?: { l: PaintLayer; ox: number; oy: number; w: number; h: number }; // work area in layer pixels
}

// Dragging with the select / move tools (positions in canvas pixels, fractional).
interface LayerDrag {
  id: string;
  mode: 'move' | 'resize' | 'cel' | 'marquee';
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  layer?: Layer;
  cel?: Cel;
  bounds?: Box;
  moved: boolean;
}

const HANDLE = 10; // resize handle size, screen pixels

// Marquee in whole canvas cells.
function marqueeRect(d: LayerDrag): Box {
  const x0 = Math.floor(Math.min(d.startX, d.curX)), y0 = Math.floor(Math.min(d.startY, d.curY));
  const x1 = Math.ceil(Math.max(d.startX, d.curX)), y1 = Math.ceil(Math.max(d.startY, d.curY));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

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
  const target = paintTarget(p, s.selectedLayer);
  const selectedSticker = layers.find((l) => l.id === s.selectedLayer && l.kind === 'sticker');
  const hasClock = layers.some((l) => l.kind === 'clock' && !l.hidden);
  const seconds = layers.some((l) => l.kind === 'clock' && !l.hidden && usesSeconds(l.format));

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

  const drawClocks = (ctx: CanvasRenderingContext2D) => {
    if (!hasClock) return;
    const preset = getPreset(p.presetId);
    const overlay = clockOverlay(p, preset.width, preset.height);
    if (!overlay) return;
    const k = z / p.scale;
    ctx.imageSmoothingEnabled = k < 1;
    ctx.drawImage(overlay, -p.offsetX * k, -p.offsetY * k, preset.width * k, preset.height * k);
    ctx.imageSmoothingEnabled = false;
  };

  const drawSelection = (ctx: CanvasRenderingContext2D) => {
    const d = drag.current;
    if (d?.mode === 'marquee') {
      const r = marqueeRect(d);
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#4f8cff';
      ctx.fillStyle = 'rgba(79,140,255,0.12)';
      ctx.setLineDash([5, 3]);
      ctx.fillRect(r.x * z, r.y * z, r.w * z, r.h * z);
      ctx.strokeRect(r.x * z, r.y * z, r.w * z, r.h * z);
      ctx.restore();
    }
    const sel = layers.find((l) => l.id === s.selectedLayer);
    if (!sel || (tool !== 'select' && tool !== 'move')) return;
    const b = layerBounds(p, sel, frameIndex);
    const x = b.x * z, y = b.y * z, w = b.w * z, h = b.h * z;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#4f8cff';
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.setLineDash([]);
    if (tool === 'select') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.rect(x + w + 2 - HANDLE / 2, y + h + 2 - HANDLE / 2, HANDLE, HANDLE);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  const toImage = (data: Pixels | ImageData) => {
    const img = new OffscreenCanvas(p.width, p.height);
    img.getContext('2d')!.putImageData(data instanceof ImageData ? data : new ImageData(data, p.width, p.height), 0, 0);
    return img;
  };

  // The frame as the panel shows it (drawing, paint layers and stickers), plus editor overlays. A
  // 1-bit OLED shows its real output: lit pixels in the chosen OLED color, with threshold and dither.
  const panelImage = (shown: Frame, proj: typeof p) => isMono(proj)
    ? monoCanvasImage(proj, (processFrame(proj, shown) as { bits: Uint8Array }).bits, s.oledTint)
    : bakeLayers(proj, shown);

  const draw = (shown: Frame, proj = p) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(toImage(panelImage(shown, proj)), 0, 0, p.width * z, p.height * z);
    if (onion && frameIndex > 0) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(toImage(bakeLayers(p, p.frames[frameIndex - 1])), 0, 0, p.width * z, p.height * z);
      ctx.globalAlpha = 1;
    }
    drawClocks(ctx);
    if (grid && z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < p.width; x++) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, p.height * z); }
      for (let y = 1; y < p.height; y++) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(p.width * z, y * z + 0.5); }
      ctx.stroke();
    }
    if (hover && tool !== 'move' && tool !== 'select') {
      const size = tool === 'pencil' || tool === 'eraser' ? s.brush * (target?.scale ?? 1) : 1;
      const o = Math.floor((size - 1) / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeRect((hover.x - o) * z + 0.5, (hover.y - o) * z + 0.5, size * z - 1, size * z - 1);
    }
    drawSelection(ctx);
  };

  // What a stroke in progress looks like on the frame.
  const strokeFrame = (st: Stroke, f = frame): Frame => {
    if (!st.layer) return { ...f, data: st.work.slice() }; // copy: baked results are cached per buffer
    const { l, ox, oy, w, h } = st.layer;
    return withCel(f, l.id, { x: ox, y: oy, w, h, data: st.work });
  };

  useEffect(() => {
    if (!stroke.current) draw(frame);
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

  // Work area for drawing on a paint layer: the canvas and the existing cel, in layer pixels.
  const layerWork = (l: PaintLayer, f = frame) => {
    const cel = f.cels?.[l.id];
    let x0 = Math.floor(-l.x / l.scale), y0 = Math.floor(-l.y / l.scale);
    let x1 = Math.ceil((p.width - l.x) / l.scale), y1 = Math.ceil((p.height - l.y) / l.scale);
    if (cel) {
      x0 = Math.min(x0, cel.x); y0 = Math.min(y0, cel.y);
      x1 = Math.max(x1, cel.x + cel.w); y1 = Math.max(y1, cel.y + cel.h);
    }
    const w = x1 - x0, h = y1 - y0;
    return { area: { l, ox: x0, oy: y0, w, h }, data: celInto(cel, x0, y0, w, h) };
  };

  // Canvas cell → pixel in the stroke's buffer; on a paint layer mirror drawing becomes a second pass.
  const passes = (st: Stroke): ((x: number, y: number) => [number, number])[] => {
    const L = st.layer;
    if (!L) return [(x, y) => [x, y]];
    const map = (x: number, y: number): [number, number] => {
      const q = toLayer(L.l, x, y);
      return [q.x - L.ox, q.y - L.oy];
    };
    return s.mirror ? [map, (x, y) => map(p.width - 1 - x, y)] : [map];
  };

  const strokeSurface = (st: Stroke): Surface =>
    st.layer ? { data: st.work, w: st.layer.w, h: st.layer.h, mirror: false } : surface(st.work);

  const apply = (st: Stroke, x: number, y: number) => {
    const surf = strokeSurface(st);
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') st.work.set(st.base);
    for (const m of passes(st)) {
      const [ax, ay] = m(st.startX, st.startY), [lx, ly] = m(st.lastX, st.lastY), [bx, by] = m(x, y);
      switch (tool) {
        case 'pencil':
        case 'eraser':
          line(surf, lx, ly, bx, by, st.color, s.brush);
          break;
        case 'line':
          line(surf, ax, ay, bx, by, st.color);
          break;
        case 'rect':
          rect(surf, ax, ay, bx, by, st.color, s.filled);
          break;
        case 'ellipse':
          ellipse(surf, ax, ay, bx, by, st.color, s.filled);
          break;
        case 'move':
          st.work.set(shifted(st.base, p.width, p.height, x - st.startX, y - st.startY));
          break;
      }
    }
    st.lastX = x;
    st.lastY = y;
    st.changed = true;
  };

  // Is a visible pixel of the paint layer within a pixel of the point?
  const touchesPaint = (l: PaintLayer, pt: { x: number; y: number }) => {
    const cel = frame.cels?.[l.id];
    if (!cel) return false;
    const cx = Math.floor(pt.x), cy = Math.floor(pt.y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (celAlphaAt(l, cel, cx + dx, cy + dy)) return true;
    return false;
  };

  // Topmost visible layer under the point, and whether the point is on the selected layer's resize handle.
  const hitLayer = (pt: { x: number; y: number }) => {
    const inBox = (b: Box, pad: number) => pt.x >= b.x - pad && pt.y >= b.y - pad && pt.x <= b.x + b.w + pad && pt.y <= b.y + b.h + pad;
    const sel = layers.find((l) => l.id === s.selectedLayer && !l.hidden);
    if (sel) {
      const b = layerBounds(p, sel, frameIndex);
      const hx = b.x + b.w + 2 / z, hy = b.y + b.h + 2 / z, r = HANDLE / z;
      if (Math.abs(pt.x - hx) <= r && Math.abs(pt.y - hy) <= r) return { layer: sel, mode: 'resize' as const, bounds: b };
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.hidden) continue;
      const b = layerBounds(p, l, frameIndex);
      if (l.kind === 'paint' ? touchesPaint(l, pt) : inBox(b, 3 / z)) return { layer: l, mode: 'move' as const, bounds: b };
    }
    // The selected object can be grabbed anywhere inside its box.
    if (sel) {
      const b = layerBounds(p, sel, frameIndex);
      if (inBox(b, 3 / z)) return { layer: sel, mode: 'move' as const, bounds: b };
    }
    return null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    // No text selection: pressing inside selected text (the module's printed labels) would start a
    // native drag of it, which cancels the pointer and stops a layer drag halfway.
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    if (store.state.playing) store.set({ playing: false });
    const pt = toPoint(e);
    const startDrag = (d: Omit<LayerDrag, 'startX' | 'startY' | 'curX' | 'curY' | 'moved'>) => {
      canvasRef.current!.setPointerCapture(e.pointerId);
      drag.current = { ...d, startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y, moved: false };
    };

    if (tool === 'select') {
      const hit = hitLayer(pt);
      if (!hit) {
        // Empty spot: drag a rectangle to turn the drawing inside it into a layer.
        startDrag({ id: '', mode: 'marquee' });
        return;
      }
      const tab = store.state.sideTab;
      const sideTab = hit.layer.kind === 'paint' ? 'layers' : tab === 'layers' ? 'layers' : 'insert';
      store.set({ selectedLayer: hit.layer.id, sideTab });
      startDrag({ id: hit.layer.id, mode: hit.mode, layer: hit.layer, bounds: hit.bounds });
      return;
    }

    if (target?.hidden) {
      toast(t('This layer is hidden. Show it to edit it.'), true);
      return;
    }

    // The move tool on a paint layer moves only this frame's pixels of it.
    if (tool === 'move' && target) {
      const cel = frame.cels?.[target.id];
      if (cel) startDrag({ id: target.id, mode: 'cel', layer: target, cel });
      return;
    }

    const { x, y } = toCell(e);
    const secondary = e.button === 2;
    const hex = secondary ? s.secondary : s.primary;
    const color = tool === 'eraser' ? TRANSPARENT : hexToRgba(hex);

    if (tool === 'picker') {
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
      const [r, g, b, a] = getPixel(bakeLayers(p, frame), p.width, x, y);
      if (a) store.set(secondary ? { secondary: rgbToHex(r, g, b) } : { primary: rgbToHex(r, g, b), tool: 'pencil' });
      return;
    }
    if (tool === 'fill' && (x < 0 || y < 0 || x >= p.width || y >= p.height)) return;

    // Drawing on a selected emoji / icon / text turns it into a drawing layer first (Ctrl+Z undoes it).
    let into = target, proj = p;
    if (!into && selectedSticker) {
      if (selectedSticker.hidden) {
        toast(t('This layer is hidden. Show it to edit it.'), true);
        return;
      }
      into = rasterizeSticker(selectedSticker.id);
      if (!into) return;
      proj = store.state.project;
      toast(t('Turned it into a drawing layer so you can draw on it (Ctrl+Z to undo)'));
    }
    const cur = proj.frames[frameIndex];

    if (tool === 'fill') {
      if (into) {
        const { area, data } = layerWork(into, cur);
        const st: Stroke = { base: data, work: data, color, startX: x, startY: y, lastX: x, lastY: y, changed: true, layer: area };
        const surf = strokeSurface(st);
        for (const m of passes(st)) floodFill(surf, ...m(x, y), color);
        setCel(frameIndex, into.id, trimCel(data, area.w, area.h, area.ox, area.oy));
        return;
      }
      const work = frame.data.slice();
      floodFill(surface(work), x, y, color);
      setFrameData(frameIndex, work);
      return;
    }
    canvasRef.current!.setPointerCapture(e.pointerId);
    let st: Stroke;
    if (into) {
      const { area, data } = layerWork(into, cur);
      st = { base: data, work: data.slice(), color, startX: x, startY: y, lastX: x, lastY: y, changed: false, layer: area };
    } else {
      st = { base: frame.data, work: frame.data.slice(), color, startX: x, startY: y, lastX: x, lastY: y, changed: false };
    }
    stroke.current = st;
    apply(st, x, y);
    draw(strokeFrame(st, cur), proj);
  };

  const dragLayer = (d: LayerDrag, pt: { x: number; y: number }) => {
    d.curX = pt.x;
    d.curY = pt.y;
    const dx = pt.x - d.startX, dy = pt.y - d.startY;
    if (d.mode === 'marquee') {
      d.moved ||= Math.abs(dx) * z > 4 || Math.abs(dy) * z > 4;
      draw(frame);
      return;
    }
    const l = d.layer!;
    if (d.mode === 'cel') {
      const c = d.cel!, k = (l as PaintLayer).scale;
      setCel(frameIndex, d.id, { ...c, x: c.x + Math.round(dx / k), y: c.y + Math.round(dy / k) }, true);
    } else if (d.mode === 'move') {
      if (l.kind === 'clock') updateLayer(d.id, { x: Math.round(l.x + dx * p.scale), y: Math.round(l.y + dy * p.scale) }, true);
      else updateLayer(d.id, { x: Math.round(l.x + dx), y: Math.round(l.y + dy) }, true);
    } else {
      // Resize from the bottom-right corner, keeping the top-left in place.
      const b = d.bounds!;
      const factor = Math.max(0.05, Math.max((b.w + dx) / b.w, (b.h + dy) / b.h));
      if (l.kind === 'paint') {
        let scale = l.scale * factor;
        scale = Math.abs(scale - Math.round(scale)) < 0.12 && scale > 0.9 ? Math.round(scale) : Math.round(scale * 20) / 20;
        scaleLayer(d.id, scale, true, { layer: l, bounds: b });
      } else {
        const max = l.kind === 'sticker' ? Math.max(p.width, p.height) * 2 : getPreset(p.presetId).height;
        updateLayer(d.id, { size: Math.max(6, Math.min(max, Math.round(l.size * factor))) }, true);
      }
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
        draw(strokeFrame(st));
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
      if (d.mode === 'marquee') {
        const r = marqueeRect(d);
        if (d.moved && r.w > 0 && r.h > 0) liftToLayer(r, store.state.liftAll);
        else store.set({ selectedLayer: null });
        draw(frame);
      } else if (d.moved) store.endLive();
      return;
    }
    const st = stroke.current;
    stroke.current = null;
    if (!st?.changed) return;
    if (st.layer) {
      const { l, ox, oy, w, h } = st.layer;
      setCel(frameIndex, l.id, trimCel(st.work, w, h, ox, oy));
    } else setFrameData(frameIndex, st.work);
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
  const drawing = tool !== 'select' && tool !== 'picker';

  return (
    <div class={`stage${dropping ? ' dropping' : ''}`} ref={stageRef} onWheel={onWheel}
      onDragOver={onDragOver} onDragLeave={(e) => e.target === stageRef.current && setDropping(false)} onDrop={onDrop}>
      <div class="stage-bar">
        <IconButton icon="zoomOut" title={t('Zoom out')} onClick={() => store.set({ zoom: Math.max(1, z - 1) })} />
        <button class={`btn${zoom === 0 ? ' active' : ''}`} onClick={() => store.set({ zoom: 0 })} title={t('Fit to view')}>
          {z}×
        </button>
        <IconButton icon="zoomIn" title={t('Zoom in')} onClick={() => store.set({ zoom: Math.min(40, z + 1) })} />
        {drawing && tool !== 'move' && !target && selectedSticker && (
          <button class="btn small target-chip" title={t('Click to draw on the background instead')}
            onClick={() => store.set({ selectedLayer: null })}>
            {t('Drawing on: {name}', { name: layerLabel(selectedSticker, clockTimeOf(new Date())) })} ✕
          </button>
        )}
        {drawing && target && (
          <button class="btn small target-chip" title={t('Click to draw on the background instead')}
            onClick={() => store.set({ selectedLayer: null })}>
            {t('Drawing on: {name}', { name: target.name })} ✕
          </button>
        )}
      </div>
      <ModuleFrame presetId={p.presetId} screenW={preset.width * (z / p.scale)} screenH={preset.height * (z / p.scale)}
        background={isMono(p) ? oledScreenColor(p, s.oledTint) : p.background}>
      <canvas
        class={`edit${isMono(p) ? ' oled' : ''}`}
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
        onDragStart={(e) => e.preventDefault()}
      />
      </ModuleFrame>
      {dropping && <div class="drop-hint">{t('Drop to place it here')}</div>}
      <div class="meta">
        {t('Image')} {p.width}×{p.height}
        {p.scale > 1 && <> · {t('enlarged ×{k}', { k: p.scale })}</>} → {t('screen')} {preset.width}×{preset.height}
        {!fitsExactly && <> · {t('margin')} {p.offsetX},{p.offsetY}</>}
        {hover && tool !== 'select' && <> · ({hover.x}, {hover.y})</>}
        {tool === 'select' && <> · {t('drag to move · drag the corner to resize · drag on an empty spot to turn a drawing into a layer')}</>}
        {tool === 'move' && target && <> · {t('moves this frame of the layer only')}</>}
      </div>
    </div>
  );
}
