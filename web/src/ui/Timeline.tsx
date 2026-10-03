import { memo } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
import { totalDuration } from '../model/project';
import { addFrame, deleteFrame, moveFrame, selectFrame, setDelay, store, type EditorState } from '../model/store';
import type { Frame } from '../model/types';
import { IconButton } from './common';

const THUMB_H = 52;

const Thumb = memo(function Thumb(props: { frame: Frame; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cw = Math.min(120, Math.round((props.w * THUMB_H) / props.h));
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const img = new OffscreenCanvas(props.w, props.h);
    img.getContext('2d')!.putImageData(new ImageData(props.frame.data, props.w, props.h), 0, 0);
    ctx.imageSmoothingEnabled = c.width < props.w; // smooth only when shrinking
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
  }, [props.frame.data, props.w, props.h]);
  return <canvas ref={ref} width={cw} height={THUMB_H} style={{ width: cw, height: THUMB_H }} />;
});

export function Timeline({ s }: { s: EditorState }) {
  const { project: p, frameIndex } = s;
  const frame = p.frames[frameIndex];
  const stripRef = useRef<HTMLDivElement>(null);
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
        <IconButton icon={s.playing ? 'pause' : 'play'} fill title={s.playing ? 'หยุด (Space)' : 'เล่น (Space)'}
          active={s.playing} onClick={() => store.set({ playing: !s.playing })} />
        <IconButton icon="plus" title="เพิ่มเฟรมว่าง" onClick={() => addFrame(false)} />
        <IconButton icon="copy" title="ทำซ้ำเฟรม (D)" onClick={() => addFrame(true)} />
        <IconButton icon="left" title="ย้ายเฟรมไปซ้าย" onClick={() => moveFrame(-1)} disabled={frameIndex === 0} />
        <IconButton icon="right" title="ย้ายเฟรมไปขวา" onClick={() => moveFrame(1)}
          disabled={frameIndex === p.frames.length - 1} />
        <IconButton icon="trash" title="ลบเฟรม (Delete)" onClick={deleteFrame} />
        <span class="label">เฟรม {frameIndex + 1}/{p.frames.length}</span>
        <span class="label">หน่วง</span>
        <input type="number" min={10} max={10000} step={10} value={frame.delay}
          onChange={(e) => setDelay(Number((e.target as HTMLInputElement).value), false)} title="เวลาแสดงเฟรมนี้ (ms)" />
        <span class="label">ms</span>
        <span class="label">ทุกเฟรม</span>
        <input type="number" min={1} max={60} step={1} value={fps}
          onChange={(e) => setDelay(1000 / Number((e.target as HTMLInputElement).value), true)} title="ตั้งความเร็วทุกเฟรม" />
        <span class="label">fps · รวม {(totalDuration(p) / 1000).toFixed(1)} วินาที</span>
      </div>
      <div class="frames" ref={stripRef}>
        {p.frames.map((f, i) => (
          <div key={f.id} class={`thumb${i === frameIndex ? ' sel' : ''}`} onClick={() => selectFrame(i)}>
            <Thumb frame={f} w={p.width} h={p.height} />
            <span class="n">{i + 1}</span>
            <div class="d">{f.delay}ms</div>
          </div>
        ))}
      </div>
    </div>
  );
}
