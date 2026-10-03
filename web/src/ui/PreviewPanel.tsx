import { useEffect, useRef } from 'preact/hooks';
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
  const zoom = Math.max(1, Math.min(Math.floor(280 / preset.width), Math.floor(320 / preset.height)));
  const mono = isMono(p);

  useEffect(() => {
    const frame = p.frames[s.frameIndex];
    const img = composeScreen(p, outputFrame(p, frame), s.oledTint);
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
