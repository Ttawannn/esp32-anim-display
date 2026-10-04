import { useEffect, useRef, useState } from 'preact/hooks';
import { clockTimeOf, usesSeconds } from '../layers/clock';
import { widgetsFor } from '../layers/raster';
import { getPreset, PRESETS } from '../model/presets';
import { retarget } from '../model/project';
import { store, type EditorState } from '../model/store';
import type { OledTint } from '../model/types';
import { isMono, outputFrame } from '../render/output';
import { composeScreen } from '../render/screen';

// Shows the current frame exactly as the panel will: RGB565 / 1-bit, scaling, offset, round mask.
export function PreviewPanel({ s }: { s: EditorState }) {
  const { project: p } = s;
  const preset = getPreset(p.presetId);
  const ref = useRef<HTMLCanvasElement>(null);
  // Fit a 180px box (fractional zoom is fine with pixelated scaling) so the tabs below stay in view.
  const zoom = Math.min(180 / preset.width, 180 / preset.height);
  const mono = isMono(p);

  // Clock layers tick in the preview like they will on the board.
  const [, setTick] = useState(0);
  const clockLayers = (p.layers ?? []).filter((l) => l.kind === 'clock');
  const seconds = clockLayers.some((l) => l.kind === 'clock' && usesSeconds(l.format));
  useEffect(() => {
    if (!clockLayers.length) return;
    const t = setInterval(() => setTick((n) => n + 1), seconds ? 1000 : 10000);
    return () => clearInterval(t);
  }, [clockLayers.length > 0, seconds]);

  useEffect(() => {
    const frame = p.frames[s.frameIndex];
    let clock;
    try {
      const w = widgetsFor(p);
      clock = w ? { parsed: w.parsed, time: clockTimeOf(new Date()) } : undefined;
    } catch { /* too large: the layer panel shows the error */ }
    const img = composeScreen(p, outputFrame(p, frame), s.oledTint, clock);
    ref.current!.getContext('2d')!.putImageData(img, 0, 0);
  });

  return (
    <div class="section">
      <h3>จำลองจอ</h3>
      <div class="row">
        <select class="grow" value={p.presetId} title="ชนิดจอ"
          onChange={(e) => store.commit(retarget(p, (e.target as HTMLSelectElement).value))}>
          {PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
      </div>
      <div class="device">
        <div class={`bezel${preset.round ? ' round' : ''}`}>
          <canvas ref={ref} width={preset.width} height={preset.height}
            style={{ width: preset.width * zoom, height: preset.height * zoom }} />
        </div>
      </div>
      <div class="preview-info">
        {preset.width}×{preset.height} · {mono ? 'ขาวดำ 1 บิต' : 'สี RGB565'}
      </div>
      {mono && (
        <div class="row" style={{ justifyContent: 'center' }}>
          <span class="hint">สีจอ OLED</span>
          <select value={s.oledTint} onChange={(e) => {
            store.set({ oledTint: (e.target as HTMLSelectElement).value as OledTint });
            store.savePrefs();
          }}>
            <option value="white">ขาว</option>
            <option value="blue">ฟ้า</option>
            <option value="yellow-blue">เหลือง-ฟ้า (2 สี)</option>
          </select>
        </div>
      )}
    </div>
  );
}
