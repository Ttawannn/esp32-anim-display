import { store, type EditorState } from '../model/store';
import { DEFAULT_ADJUST, type ColorAdjust, type Dither } from '../model/types';
import { isMono } from '../render/output';
import { Slider } from './common';

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

// Non-destructive color adjustments, applied when previewing and exporting.
export function AdjustPanel({ s }: { s: EditorState }) {
  const { project: p } = s;
  const a = p.adjust;
  const mono = isMono(p);
  const live = (patch: Partial<ColorAdjust>) => store.setLive({ ...p, adjust: { ...a, ...patch } });
  const commit = (patch: Partial<ColorAdjust>) => store.commit({ ...p, adjust: { ...a, ...patch } });
  const end = () => store.endLive();

  return (
    <div class="section">
      <h3>
        {mono ? 'ปรับภาพขาวดำ' : 'ปรับสี'}
        <button class="btn" style={{ height: 24, fontSize: 12 }}
          onClick={() => commit({ ...DEFAULT_ADJUST, dither: a.dither })}>
          รีเซ็ต
        </button>
      </h3>
      <Slider label="ความสว่าง" min={-100} max={100} value={a.brightness} format={signed}
        onInput={(v) => live({ brightness: v })} onCommit={end} />
      <Slider label="คอนทราสต์" min={-100} max={100} value={a.contrast} format={signed}
        onInput={(v) => live({ contrast: v })} onCommit={end} />
      {!mono && (
        <>
          <Slider label="ความสดของสี" min={-100} max={100} value={a.saturation} format={signed}
            onInput={(v) => live({ saturation: v })} onCommit={end} />
          <Slider label="เฉดสี" min={-180} max={180} value={a.hue} format={(v) => `${v}°`}
            onInput={(v) => live({ hue: v })} onCommit={end} />
          <div class="row">
            <label class="check grow">
              <input type="checkbox" checked={a.invert} onChange={() => commit({ invert: !a.invert })} /> กลับสี
            </label>
            <span class="hint">จำนวนสี</span>
            <select value={a.colors} onChange={(e) => commit({ colors: Number((e.target as HTMLSelectElement).value) })}>
              <option value={0}>ไม่จำกัด</option>
              {[256, 64, 32, 16, 8, 4, 2].map((n) => <option key={n} value={n}>{n} สี</option>)}
            </select>
          </div>
        </>
      )}
      {mono && (
        <>
          <Slider label="จุดตัดขาว/ดำ" min={1} max={254} value={a.threshold}
            onInput={(v) => live({ threshold: v })} onCommit={end} />
          <div class="row">
            <span class="hint">Dither</span>
            <select class="grow" value={a.dither} onChange={(e) => commit({ dither: (e.target as HTMLSelectElement).value as Dither })}>
              <option value="none">ไม่ใช้ (ขอบคม เหมาะกับ pixel art)</option>
              <option value="floyd">Floyd–Steinberg (ภาพถ่าย/วิดีโอ)</option>
              <option value="atkinson">Atkinson (คอนทราสต์สูง)</option>
              <option value="bayer">Bayer (ลายจุดสม่ำเสมอ)</option>
            </select>
          </div>
          <label class="check">
            <input type="checkbox" checked={a.invert} onChange={() => commit({ invert: !a.invert })} /> กลับขาว-ดำ
          </label>
        </>
      )}
    </div>
  );
}
