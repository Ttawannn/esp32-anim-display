import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DecodedGif } from '../import/gif';
import { decodeGifAsync } from '../import/gifAsync';
import { checkFrameBudget, MAX_GIF_BYTES } from '../import/limits';
import { DEFAULT_PLACEMENT, placeImage, rgbaToCanvas, type FitMode, type Placement } from '../import/resample';
import { fitScale, getPreset } from '../model/presets';
import { createProject, newFrame } from '../model/project';
import { store, toast } from '../model/store';
import { outputFrame } from '../render/output';
import { composeScreen } from '../render/screen';
import { Modal, Slider } from './common';

type SizeMode = 'native' | 'fit';

export function ImportGifDialog() {
  const target = store.state.project.presetId;
  const preset = getPreset(target);
  const [gif, setGif] = useState<DecodedGif | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [sizeMode, setSizeMode] = useState<SizeMode>('fit');
  const [divisor, setDivisor] = useState(1);
  const [pl, setPl] = useState<Placement>(DEFAULT_PLACEMENT);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [speed, setSpeed] = useState(100);
  const [previewIdx, setPreviewIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const close = () => { abort.current?.abort(); store.set({ dialog: null }); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError('');
    setProgress(0);
    try {
      if (file.size > MAX_GIF_BYTES) throw new Error('GIF ใหญ่เกิน 16 MB — ลดขนาดไฟล์ก่อนนำเข้า');
      const g = await decodeGifAsync(await file.arrayBuffer(), controller.signal, (done, total) => setProgress(done / total));
      if (controller.signal.aborted) return;
      setGif(g);
      setFileName(file.name.replace(/\.gif$/i, ''));
      setRange([0, g.frames.length - 1]);
      setPreviewIdx(0);
      // Small GIFs are usually pixel art: keep their pixels and scale up by an integer.
      const native = g.width <= preset.width && g.height <= preset.height;
      setSizeMode(native && g.width * 2 <= preset.width ? 'native' : 'fit');
      setPl({ ...DEFAULT_PLACEMENT, smooth: !(native && g.width * 2 <= preset.width) });
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally { if (abort.current === controller) setProgress(null); }
  };

  // Output canvas geometry for the chosen mode.
  const geom = useMemo(() => {
    if (!gif) return null;
    if (sizeMode === 'native') return { w: gif.width, h: gif.height, scale: fitScale(preset, gif.width, gif.height) };
    return { w: Math.floor(preset.width / divisor), h: Math.floor(preset.height / divisor), scale: divisor };
  }, [gif, sizeMode, divisor, preset]);

  const buildFrames = (indices: number[]) => {
    const g = gif!, ge = geom!;
    checkFrameBudget(ge.w, ge.h, indices.length);
    const ctx = new OffscreenCanvas(ge.w, ge.h).getContext('2d', { willReadFrequently: true })!;
    return indices.map((i) => {
      const f = g.frames[i];
      const data = sizeMode === 'native'
        ? f.data.slice()
        : new Uint8ClampedArray(placeImage(rgbaToCanvas(f.data, g.width, g.height), g.width, g.height, ge.w, ge.h, pl, ctx));
      return newFrame(ge.w, ge.h, Math.max(10, Math.round((f.delay * 100) / speed)), data);
    });
  };

  const makeProject = (frames: ReturnType<typeof buildFrames>) =>
    createProject({ presetId: target, width: geom!.w, height: geom!.h, scale: geom!.scale, name: fileName, frames, source: 'gif' });

  // Preview one frame through the real output pipeline.
  useEffect(() => {
    if (!gif || !geom || !canvasRef.current) return;
    const p = makeProject(buildFrames([previewIdx]));
    canvasRef.current.getContext('2d')!.putImageData(composeScreen(p, outputFrame(p, p.frames[0]), store.state.oledTint), 0, 0);
  });

  const doImport = () => {
    try {
      const idx: number[] = [];
      for (let i = range[0]; i <= range[1]; i++) idx.push(i);
      const p = makeProject(buildFrames(idx));
      store.load(p);
      store.set({ dialog: null, zoom: 0 });
      toast(`นำเข้า ${idx.length} เฟรมแล้ว`);
    } catch (error) { setError((error as Error).message); }
  };

  const zoom = Math.max(1, Math.min(Math.floor(300 / preset.width), Math.floor(300 / preset.height)));

  return (
    <Modal title="นำเข้า GIF" onClose={close}
      footer={<><button class="btn" onClick={close}>ยกเลิก</button>
        <button class="btn primary" disabled={!gif} onClick={doImport}>นำเข้า</button></>}>
      {!gif ? (
        <label class="drop" onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer?.files[0]); }}>
          <input type="file" accept="image/gif" hidden onChange={(e) => onFile((e.target as HTMLInputElement).files?.[0])} />
          {progress === null ? 'เลือกไฟล์ GIF หรือลากมาวางที่นี่' : `กำลังอ่าน GIF ${Math.round(progress * 100)}%`}
        </label>
      ) : (
        <div class="cols">
          <div>
            <div class="device">
              <div class={`bezel${preset.round ? ' round' : ''}`}>
                <canvas ref={canvasRef} width={preset.width} height={preset.height}
                  style={{ width: preset.width * zoom, height: preset.height * zoom }} />
              </div>
            </div>
            <Slider label="ดูเฟรม" min={0} max={gif.frames.length - 1} value={previewIdx}
              format={(v) => `${v + 1}`} onInput={setPreviewIdx} />
            <p class="hint">
              {fileName}.gif · {gif.width}×{gif.height} · {gif.frames.length} เฟรม ·{' '}
              {(gif.frames.reduce((s, f) => s + f.delay, 0) / 1000).toFixed(1)} วินาที
            </p>
          </div>
          <div>
            <div class="row">
              <label class="check"><input type="radio" checked={sizeMode === 'native'}
                disabled={gif.width > preset.width || gif.height > preset.height}
                onChange={() => { setSizeMode('native'); setPl({ ...pl, smooth: false }); }} />
                ขนาดเดิม {gif.width}×{gif.height} ขยาย ×{fitScale(preset, gif.width, gif.height)} (pixel art)</label>
            </div>
            <div class="row">
              <label class="check"><input type="radio" checked={sizeMode === 'fit'} onChange={() => setSizeMode('fit')} />
                ปรับให้พอดีจอ</label>
            </div>
            {sizeMode === 'fit' && (
              <>
                <div class="row">
                  <select value={pl.fit} onChange={(e) => setPl({ ...pl, fit: (e.target as HTMLSelectElement).value as FitMode })}>
                    <option value="contain">พอดี (เห็นทั้งภาพ)</option>
                    <option value="cover">เต็มจอ (ครอปขอบ)</option>
                    <option value="stretch">ยืดให้เต็ม</option>
                  </select>
                  <select value={divisor} onChange={(e) => setDivisor(Number((e.target as HTMLSelectElement).value))}>
                    <option value={1}>ละเอียดเต็ม</option>
                    <option value={2}>ครึ่งหนึ่ง (ไฟล์เล็กลง ~4 เท่า)</option>
                    <option value={4}>1/4 (พิกเซลใหญ่)</option>
                  </select>
                </div>
                <label class="check"><input type="checkbox" checked={pl.smooth} onChange={() => setPl({ ...pl, smooth: !pl.smooth })} />
                  ย่อ/ขยายแบบนุ่มนวล (ปิดไว้สำหรับ pixel art)</label>
                <Slider label="ซูม" min={1} max={3} step={0.05} value={pl.zoom} format={(v) => `${v.toFixed(2)}×`}
                  onInput={(v) => setPl({ ...pl, zoom: v })} />
                <Slider label="เลื่อน X" min={-1} max={1} step={0.05} value={pl.panX} format={(v) => v.toFixed(2)}
                  onInput={(v) => setPl({ ...pl, panX: v })} />
                <Slider label="เลื่อน Y" min={-1} max={1} step={0.05} value={pl.panY} format={(v) => v.toFixed(2)}
                  onInput={(v) => setPl({ ...pl, panY: v })} />
              </>
            )}
            <Slider label="เฟรมแรก" min={0} max={gif.frames.length - 1} value={range[0]} format={(v) => `${v + 1}`}
              onInput={(v) => setRange([Math.min(v, range[1]), range[1]])} />
            <Slider label="เฟรมสุดท้าย" min={0} max={gif.frames.length - 1} value={range[1]} format={(v) => `${v + 1}`}
              onInput={(v) => setRange([range[0], Math.max(v, range[0])])} />
            <Slider label="ความเร็ว" min={25} max={400} step={5} value={speed} format={(v) => `${v}%`} onInput={setSpeed} />
          </div>
        </div>
      )}
      {error && <p class="err">{error}</p>}
    </Modal>
  );
}
