import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { bakeKey, bakeLayers } from '../layers/raster';
import { totalDuration } from '../model/project';
import { addFrame, deleteFrame, moveFrame, selectFrame, setDelay, store, type EditorState } from '../model/store';
import type { Frame, Project } from '../model/types';
import { IconButton } from './common';
import { t } from '../i18n';

const THUMB_H = 52;

// Thumbnails show the frame with its layers; `sig` (debounced layer state) decides when to redraw.
const Thumb = memo(function Thumb(props: { frame: Frame; p: Project; sig: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width: w, height: h } = props.p;
  const cw = Math.min(120, Math.round((w * THUMB_H) / h));
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const img = new OffscreenCanvas(w, h);
    img.getContext('2d')!.putImageData(new ImageData(bakeLayers(props.p, props.frame), w, h), 0, 0);
    ctx.imageSmoothingEnabled = c.width < w; // smooth only when shrinking
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }, [props.frame, props.sig, w, h]);
  return <canvas ref={ref} width={cw} height={THUMB_H} style={{ width: cw, height: THUMB_H }} />;
}, (a, b) => a.frame === b.frame && a.sig === b.sig && a.p.width === b.p.width && a.p.height === b.p.height);

// Layer changes reach the thumbnails once dragging pauses.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function Timeline({ s }: { s: EditorState }) {
  const { project: p, frameIndex } = s;
  const frame = p.frames[frameIndex];
  const stripRef = useRef<HTMLDivElement>(null);
  const sig = useDebounced(bakeKey(p), 250);
  // 67 ms is really 15 fps; show whole numbers when the delay was rounded from one.
  const rawFps = 1000 / frame.delay;
  const fps = Math.abs(rawFps - Math.round(rawFps)) < 0.2 ? Math.round(rawFps) : Math.round(rawFps * 10) / 10;

  useEffect(() => {
    const el = stripRef.current?.children[frameIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [frameIndex]);

  return (
    <div class="timeline">
      <div class="controls">
        <IconButton icon={s.playing ? 'pause' : 'play'} fill title={s.playing ? t('Pause (Space)') : t('Play (Space)')}
          active={s.playing} onClick={() => store.set({ playing: !s.playing })} />
        <IconButton icon="plus" title={t('Add an empty frame')} onClick={() => addFrame(false)} />
        <IconButton icon="copy" title={t('Duplicate frame (D)')} onClick={() => addFrame(true)} />
        <IconButton icon="left" title={t('Move frame left')} onClick={() => moveFrame(-1)} disabled={frameIndex === 0} />
        <IconButton icon="right" title={t('Move frame right')} onClick={() => moveFrame(1)}
          disabled={frameIndex === p.frames.length - 1} />
        <IconButton icon="trash" title={t('Delete frame (Del)')} onClick={deleteFrame} />
        <span class="tl-group">
          <span class="tl-count">{t('Frame')} <b>{frameIndex + 1}</b> / {p.frames.length}</span>
        </span>
        <label class="tl-group" title={t('How long this frame stays on screen')}>
          <span class="label">{t('This frame')}</span>
          <input type="number" min={10} max={10000} step={10} value={frame.delay}
            onChange={(e) => setDelay(Number((e.target as HTMLInputElement).value), false)} />
          <span class="label">ms</span>
        </label>
        <label class="tl-group" title={t('Set the same speed for every frame')}>
          <span class="label">{t('All frames')}</span>
          <input type="number" min={1} max={60} step={1} value={fps}
            onChange={(e) => setDelay(1000 / Number((e.target as HTMLInputElement).value), true)} />
          <span class="label">fps</span>
        </label>
        <span class="label">{t('Length {s} s', { s: (totalDuration(p) / 1000).toFixed(1) })}</span>
      </div>
      <div class="frames" ref={stripRef}>
        {p.frames.map((f, i) => (
          <div key={f.id} class={`thumb${i === frameIndex ? ' sel' : ''}`} onClick={() => selectFrame(i)}>
            <Thumb frame={f} p={p} sig={sig} />
            <span class="n">{i + 1}</span>
            <div class="d">{f.delay}ms</div>
          </div>
        ))}
      </div>
    </div>
  );
}
