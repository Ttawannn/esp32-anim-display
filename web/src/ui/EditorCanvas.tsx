import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  ellipse, floodFill, getPixel, hexToRgba, line, rect, shifted, TRANSPARENT,
  type RGBA, type Surface,
} from '../editor/tools';
import { getPreset } from '../model/presets';
import { rgbToHex } from '../model/project';
import { setFrameData, store, type EditorState } from '../model/store';
import type { Pixels } from '../model/types';
import { IconButton } from './common';

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

export function EditorCanvas({ s }: { s: EditorState }) {
  const { project: p, frameIndex, zoom, grid, onion, tool } = s;
  const frame = p.frames[frameIndex];
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Stroke | null>(null);
  const [fitZoom, setFitZoom] = useState(4);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const z = zoom || fitZoom;

  // Auto zoom: largest integer zoom that fits the stage.
  useLayoutEffect(() => {
    const el = stageRef.current!;
    const update = () => {
      const fz = Math.floor(Math.min((el.clientWidth - 40) / p.width, (el.clientHeight - 90) / p.height));
      setFitZoom(Math.max(1, Math.min(40, fz)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.width, p.height]);

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
    if (grid && z >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < p.width; x++) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, p.height * z); }
      for (let y = 1; y < p.height; y++) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(p.width * z, y * z + 0.5); }
      ctx.stroke();
    }
    if (hover && tool !== 'move') {
      const size = tool === 'pencil' || tool === 'eraser' ? s.brush : 1;
      const o = Math.floor((size - 1) / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeRect((hover.x - o) * z + 0.5, (hover.y - o) * z + 0.5, size * z - 1, size * z - 1);
    }
  };

  useEffect(() => {
    if (!stroke.current) draw(frame.data);
  });

  const toCell = (e: PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / z), y: Math.floor((e.clientY - r.top) / z) };
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

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    if (store.state.playing) store.set({ playing: false });
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

  const onPointerMove = (e: PointerEvent) => {
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
    const st = stroke.current;
    stroke.current = null;
    if (st?.changed) setFrameData(frameIndex, st.work);
  };

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    store.set({ zoom: Math.max(1, Math.min(40, z + (e.deltaY < 0 ? 1 : -1))) });
  };

  const preset = getPreset(p.presetId);
  const fitsExactly = p.width * p.scale === preset.width && p.height * p.scale === preset.height;

  return (
    <div class="stage" ref={stageRef} onWheel={onWheel}>
      <div class="stage-bar">
        <IconButton icon="zoomOut" title="ซูมออก" onClick={() => store.set({ zoom: Math.max(1, z - 1) })} />
        <button class={`btn${zoom === 0 ? ' active' : ''}`} onClick={() => store.set({ zoom: 0 })} title="พอดีหน้าจอ">
          {z}×
        </button>
        <IconButton icon="zoomIn" title="ซูมเข้า" onClick={() => store.set({ zoom: Math.min(40, z + 1) })} />
      </div>
      <canvas
        class="edit"
        ref={canvasRef}
        width={p.width * z}
        height={p.height * z}
        style={{ cursor: tool === 'move' ? 'move' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div class="meta">
        ภาพ {p.width}×{p.height}
        {p.scale > 1 && <> · ขยาย ×{p.scale}</>} → จอ {preset.width}×{preset.height}
        {!fitsExactly && <> · ระยะขอบ {p.offsetX},{p.offsetY}</>}
        {hover && <> · ({hover.x}, {hover.y})</>}
      </div>
    </div>
  );
}
