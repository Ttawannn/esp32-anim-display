import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_PLACEMENT, placeImage, type FitMode, type Placement } from '../import/resample';
import { extractFrames, loadVideo, seek, type VideoInfo } from '../import/video';
import { getPreset } from '../model/presets';
import { createProject, newFrame } from '../model/project';
import { store, toast } from '../model/store';
import { outputFrame } from '../render/output';
import { composeScreen } from '../render/screen';
import { formatBytes, Modal, Slider } from './common';
import { DEVICE_STORAGE } from './OutputPanel';

const FPS_OPTIONS = [8, 10, 12, 15, 20, 24, 30];

export function ImportVideoDialog() {
  const target = store.state.project.presetId;
  const preset = getPreset(target);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fps, setFps] = useState(15);
  const [divisor, setDivisor] = useState(1);
  const [pl, setPl] = useState<Placement>({ ...DEFAULT_PLACEMENT, fit: 'cover' });
  const [progress, setProgress] = useState<number | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const w = Math.floor(preset.width / divisor), h = Math.floor(preset.height / divisor);
  const frameCount = Math.max(1, Math.floor((end - start) * fps));
  // Rough JPEG size: ~10 KB per 240x240 frame at q75; mono frames are tiny.
  const perFrame = preset.color === 'mono' ? (w * h) / 8 / 3 : (w * h * 10240) / 57600;
  const estimate = frameCount * perFrame;

  const close = () => {
    abort.current?.abort();
    if (info) URL.revokeObjectURL(info.video.src);
    store.set({ dialog: null });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      const v = await loadVideo(file);
      setInfo(v);
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setStart(0);
      // Default clip length that fits comfortably on the board.
      const maxSeconds = (DEVICE_STORAGE * 0.8) / (perFrame * 15);
      setEnd(Math.min(v.duration, Math.max(1, Math.floor(maxSeconds))));
      setPreviewTime(0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Preview the frame at previewTime through the real output pipeline.
  useEffect(() => {
    if (!info || !canvasRef.current || progress !== null) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      await seek(info.video, Math.min(previewTime, info.duration - 0.001), controller.signal);
      if (cancelled) return;
      const data = new Uint8ClampedArray(placeImage(info.video, info.width, info.height, w, h, pl));
      const p = createProject({ presetId: target, width: w, height: h, scale: divisor, frames: [newFrame(w, h, 100, data)], source: 'video' });
      canvasRef.current?.getContext('2d')!.putImageData(composeScreen(p, outputFrame(p, p.frames[0]), store.state.oledTint), 0, 0);
    })().catch((error) => { if (!cancelled) setError((error as Error).message); });
    return () => { cancelled = true; controller.abort(); };
  }, [info, previewTime, pl, divisor, progress]);

  const doImport = async () => {
    if (!info) return;
    abort.current = new AbortController();
    setProgress(0);
    try {
      const frames = await extractFrames(info, { start, end, fps, width: w, height: h, placement: pl },
        (d, t) => setProgress(d / t), abort.current.signal);
      const p = createProject({
        presetId: target, width: w, height: h, scale: divisor, name: fileName, source: 'video',
        frames: frames.map((f) => newFrame(w, h, f.delay, f.data)),
      });
      URL.revokeObjectURL(info.video.src);
      store.load(p);
      store.set({ dialog: null, zoom: 0 });
      toast(`นำเข้า ${frames.length} เฟรมแล้ว`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      setProgress(null);
    }
  };

  const zoom = Math.max(1, Math.min(Math.floor(300 / preset.width), Math.floor(260 / preset.height)));
  const fmt = (t: number) => `${t.toFixed(1)}s`;

  return (
    <Modal title="นำเข้าวิดีโอ" onClose={close}
      footer={<>
        <button class="btn" onClick={close}>{progress !== null ? 'ยกเลิก' : 'ปิด'}</button>
        <button class="btn primary" disabled={!info || progress !== null || end <= start} onClick={doImport}>
          นำเข้า {info ? `${frameCount} เฟรม` : ''}
        </button>
      </>}>
      {!info ? (
        <label class="drop" onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer?.files[0]); }}>
          <input type="file" accept="video/*" hidden onChange={(e) => onFile((e.target as HTMLInputElement).files?.[0])} />
          เลือกไฟล์วิดีโอ (MP4, WebM, MOV) หรือลากมาวางที่นี่
          <p class="hint">ไฟล์ถูกแปลงในเบราว์เซอร์นี้ ไม่ได้อัปโหลดไปที่ไหน</p>
          {error && <p class="err">{error}</p>}
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
            <Slider label="ดูตำแหน่ง" min={0} max={info.duration} step={0.05} value={previewTime} format={fmt}
              onInput={setPreviewTime} />
            <p class="hint">{fileName} · {info.width}×{info.height} · {info.duration.toFixed(1)} วินาที</p>
            {progress !== null && (
              <>
                <p class="hint">กำลังดึงเฟรม {Math.round(progress * frameCount)}/{frameCount}</p>
                <div class="progress"><div style={{ width: `${progress * 100}%` }} /></div>
              </>
            )}
          </div>
          <div>
            <Slider label="เริ่ม" min={0} max={info.duration} step={0.1} value={start} format={fmt}
              onInput={(v) => { setStart(Math.min(v, end - 0.1)); setPreviewTime(v); }} />
            <Slider label="จบ" min={0} max={info.duration} step={0.1} value={end} format={fmt}
              onInput={(v) => { setEnd(Math.max(v, start + 0.1)); setPreviewTime(v); }} />
            <div class="row">
              <span class="hint">fps</span>
              <select value={fps} onChange={(e) => setFps(Number((e.target as HTMLSelectElement).value))}>
                {FPS_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={divisor} onChange={(e) => setDivisor(Number((e.target as HTMLSelectElement).value))}>
                <option value={1}>ละเอียดเต็ม {preset.width}×{preset.height}</option>
                <option value={2}>ครึ่งหนึ่ง {Math.floor(preset.width / 2)}×{Math.floor(preset.height / 2)}</option>
              </select>
            </div>
            <div class="row">
              <select value={pl.fit} onChange={(e) => setPl({ ...pl, fit: (e.target as HTMLSelectElement).value as FitMode })}>
                <option value="cover">เต็มจอ (ครอปขอบ)</option>
                <option value="contain">พอดี (เห็นทั้งภาพ)</option>
                <option value="stretch">ยืดให้เต็ม</option>
              </select>
            </div>
            <Slider label="ซูม" min={1} max={4} step={0.05} value={pl.zoom} format={(v) => `${v.toFixed(2)}×`}
              onInput={(v) => setPl({ ...pl, zoom: v })} />
            <Slider label="เลื่อน X" min={-1} max={1} step={0.05} value={pl.panX} format={(v) => v.toFixed(2)}
              onInput={(v) => setPl({ ...pl, panX: v })} />
            <Slider label="เลื่อน Y" min={-1} max={1} step={0.05} value={pl.panY} format={(v) => v.toFixed(2)}
              onInput={(v) => setPl({ ...pl, panY: v })} />
            <div class="stat"><span>ประมาณ</span><b>{frameCount} เฟรม · ~{formatBytes(Math.round(estimate))}</b></div>
            {estimate > DEVICE_STORAGE && <p class="warn">น่าจะใหญ่เกินพื้นที่บอร์ด ลองตัดให้สั้นลง ลด fps หรือลดความละเอียด</p>}
            {error && <p class="err">{error}</p>}
            <p class="hint">ปรับสีได้หลังนำเข้าในแผง "ปรับสี"</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
