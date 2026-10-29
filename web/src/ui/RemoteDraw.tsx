// Phone remote: a drawing pad shaped like the board's screen. Draw with a finger; with "Show while
// drawing" the screen follows each stroke (live preview), and "Keep it on the board" saves the
// picture as a file that plays like any other.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { encodeProject } from '../codec/encode';
import { device, type DeviceInfo } from '../device/api';
import { boardPresetId, installProject } from '../device/install';
import { getPreset } from '../model/presets';
import { createProject, newFrame } from '../model/project';
import { toast } from '../model/store';
import type { Project } from '../model/types';
import { canvasFor } from '../templates/gallery';
import { Icon } from './common';
import { t } from '../i18n';

const PEN_COLORS = ['#ffffff', '#ff4d6d', '#ffd23f', '#7cff6b', '#4fd1ff', '#b98cff', '#ff9f43'];
const SIZES: [string, number][] = [['Small', 0.012], ['Medium', 0.03], ['Large', 0.065]]; // radius, share of the width
const BG = '#000000';

export const drawingFile = () => t('Drawing');

export function DrawCard({ host, info, onSent }: { host: string; info: DeviceInfo; onSent: () => void }) {
  const presetId = boardPresetId(info);
  const screen = getPreset(presetId);
  const mono = screen.color === 'mono';
  const [big, setBig] = useState(false);
  const { scale, w, h } = canvasFor(screen, big ? 6 : 2);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [size, setSize] = useState(1);
  const [erase, setErase] = useState(false);
  const [live, setLive] = useState(true);
  const [sending, setSending] = useState<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<ImageData[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);
  const carry = useRef<OffscreenCanvas | null>(null); // the picture across a pixel-size change
  const liveState = useRef({ busy: false, pending: false, used: false });

  const ctx = () => canvasRef.current!.getContext('2d', { willReadFrequently: true })!;

  // A new canvas size keeps the picture, scaled with hard pixel edges.
  useLayoutEffect(() => {
    const c = ctx();
    c.fillStyle = BG;
    c.fillRect(0, 0, w, h);
    if (carry.current) {
      c.imageSmoothingEnabled = false;
      c.drawImage(carry.current, 0, 0, w, h);
      carry.current = null;
    }
    history.current = [];
    setCanUndo(false);
  }, [w, h]);

  // Leaving the page (or turning live off) gives the screen back to its animations.
  useEffect(() => () => { if (liveState.current.used) device.liveEnd(host).catch(() => {}); }, [host]);

  const project = (): Project => {
    const data = ctx().getImageData(0, 0, w, h).data;
    const p = createProject({ presetId, width: w, height: h, scale, name: drawingFile(), background: BG, frames: [newFrame(w, h, 1000, data)] });
    if (mono) p.adjust.dither = 'none';
    return p;
  };

  // One live request at a time; strokes made meanwhile are sent together afterwards.
  const pushLive = async () => {
    const s = liveState.current;
    if (!live) return;
    if (s.busy) { s.pending = true; return; }
    s.busy = true;
    try {
      do {
        s.pending = false;
        const { bytes } = await encodeProject({ ...project(), loop: 0 });
        await device.live(host, bytes);
        s.used = true;
      } while (s.pending);
    } catch (e) {
      setLive(false);
      toast((e as Error).message, true);
    } finally {
      s.busy = false;
    }
  };

  const toggleLive = () => {
    if (live && liveState.current.used) {
      device.liveEnd(host).catch(() => {});
      liveState.current.used = false;
    }
    setLive(!live);
  };

  const snapshot = () => {
    history.current.push(ctx().getImageData(0, 0, w, h));
    if (history.current.length > 30) history.current.shift();
    setCanUndo(true);
  };

  // Round brush with hard edges: filled rows, no anti-aliasing (crisp on pixel and 1-bit panels).
  const stamp = (cx: number, cy: number) => {
    const c = ctx();
    const r = Math.max(0.5, SIZES[size][1] * w);
    c.fillStyle = erase ? BG : mono ? '#ffffff' : color;
    for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      c.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2 + 1, 1);
    }
  };

  const toCanvas = (e: PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * w - 0.5, y: ((e.clientY - rect.top) / rect.height) * h - 0.5 };
  };

  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    try { canvasRef.current!.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    snapshot();
    const p = toCanvas(e);
    last.current = p;
    stamp(p.x, p.y);
  };
  const onMove = (e: PointerEvent) => {
    const from = last.current;
    if (!from) return;
    const to = toCanvas(e);
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2));
    for (let i = 1; i <= steps; i++) stamp(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    last.current = to;
  };
  const onUp = () => {
    if (!last.current) return;
    last.current = null;
    pushLive();
  };

  const undo = () => {
    const img = history.current.pop();
    if (!img) return;
    ctx().putImageData(img, 0, 0);
    setCanUndo(history.current.length > 0);
    pushLive();
  };
  const clear = () => {
    snapshot();
    const c = ctx();
    c.fillStyle = BG;
    c.fillRect(0, 0, w, h);
    pushLive();
  };
  const changePixels = (next: boolean) => {
    if (next === big) return;
    const copy = new OffscreenCanvas(w, h);
    copy.getContext('2d')!.drawImage(canvasRef.current!, 0, 0);
    carry.current = copy;
    setBig(next);
  };

  const keep = async () => {
    setSending(0);
    try {
      if (liveState.current.used) { await device.liveEnd(host).catch(() => {}); liveState.current.used = false; }
      await installProject(host, project(), drawingFile(), setSending);
      toast(t('Drawing sent to the screen'));
      onSent();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSending(null);
    }
  };

  return (
    <section class="card draw">
      <h3><Icon name="pencil" /> {t('Draw on the screen')}</h3>
      <canvas ref={canvasRef} width={w} height={h} class={`draw-pad${screen.round ? ' round' : ''}`}
        style={{ aspectRatio: `${screen.width} / ${screen.height}` }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onContextMenu={(e) => e.preventDefault()} />
      {!mono && (
        <div class="color-dots" role="radiogroup" aria-label={t('Pen color')}>
          {PEN_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={!erase && c === color} class={!erase && c === color ? 'sel' : ''}
              style={{ background: c }} title={c} onClick={() => { setColor(c); setErase(false); }} />
          ))}
        </div>
      )}
      <div class="row draw-tools">
        <div class="seg two grow">
          <button class={!erase ? 'active' : ''} onClick={() => setErase(false)}><Icon name="pencil" /> {t('Pen')}</button>
          <button class={erase ? 'active' : ''} onClick={() => setErase(true)}><Icon name="eraser" /> {t('Eraser')}</button>
        </div>
        <button class="btn icon" title={t('Undo')} disabled={!canUndo} onClick={undo}><Icon name="undo" /></button>
        <button class="btn icon" title={t('Clear')} onClick={clear}><Icon name="trash" /></button>
      </div>
      <div class="seg three" role="radiogroup" aria-label={t('Brush size')}>
        {SIZES.map(([label], i) => (
          <button key={label} role="radio" aria-checked={size === i} class={size === i ? 'active' : ''} onClick={() => setSize(i)}>{t(label)}</button>
        ))}
      </div>
      <div class="seg two">
        <button class={!big ? 'active' : ''} onClick={() => changePixels(false)}>{t('Fine pixels')}</button>
        <button class={big ? 'active' : ''} onClick={() => changePixels(true)}>{t('Big pixels')}</button>
      </div>
      <label class="toggle">
        <input type="checkbox" checked={live} onChange={toggleLive} />
        <span class="track" />
        <span><b>{t('Show while drawing')}</b><small>{t('The screen follows every stroke')}</small></span>
      </label>
      <button class="btn primary big wide" disabled={sending !== null} onClick={keep}>
        {sending !== null ? t('Sending {pct}%', { pct: Math.round(sending * 100) }) : <><Icon name="send" /> {t('Keep it on the board')}</>}
      </button>
      <p class="hint">{t('Saved as "{file}"; a new drawing replaces it', { file: drawingFile() })}</p>
    </section>
  );
}
