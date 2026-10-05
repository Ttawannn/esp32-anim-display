import { store, type EditorState } from '../model/store';
import { DEFAULT_ADJUST, type ColorAdjust, type Dither } from '../model/types';
import { isMono } from '../render/output';
import { Slider } from './common';
import { t } from '../i18n';

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
        {mono ? t('Mono adjustments') : t('Color adjustments')}
        <button class="btn" style={{ height: 24, fontSize: 12 }}
          onClick={() => commit({ ...DEFAULT_ADJUST, dither: a.dither })}>
          {t('Reset')}
        </button>
      </h3>
      <Slider label={t('Brightness')} min={-100} max={100} value={a.brightness} format={signed}
        onInput={(v) => live({ brightness: v })} onCommit={end} />
      <Slider label={t('Contrast')} min={-100} max={100} value={a.contrast} format={signed}
        onInput={(v) => live({ contrast: v })} onCommit={end} />
      {!mono && (
        <>
          <Slider label={t('Saturation')} min={-100} max={100} value={a.saturation} format={signed}
            onInput={(v) => live({ saturation: v })} onCommit={end} />
          <Slider label={t('Hue')} min={-180} max={180} value={a.hue} format={(v) => `${v}°`}
            onInput={(v) => live({ hue: v })} onCommit={end} />
          <div class="row">
            <label class="check grow">
              <input type="checkbox" checked={a.invert} onChange={() => commit({ invert: !a.invert })} /> {t('Invert')}
            </label>
            <span class="hint">{t('Colors')}</span>
            <select value={a.colors} onChange={(e) => commit({ colors: Number((e.target as HTMLSelectElement).value) })}>
              <option value={0}>{t('Unlimited')}</option>
              {[256, 64, 32, 16, 8, 4, 2].map((n) => <option key={n} value={n}>{t('{n} colors', { n })}</option>)}
            </select>
          </div>
        </>
      )}
      {mono && (
        <>
          <Slider label={t('Threshold')} min={1} max={254} value={a.threshold}
            onInput={(v) => live({ threshold: v })} onCommit={end} />
          <div class="row">
            <span class="hint">Dither</span>
            <select class="grow" value={a.dither} onChange={(e) => commit({ dither: (e.target as HTMLSelectElement).value as Dither })}>
              <option value="none">{t('None (crisp, for pixel art)')}</option>
              <option value="floyd">{t('Floyd–Steinberg (photos/video)')}</option>
              <option value="atkinson">{t('Atkinson (high contrast)')}</option>
              <option value="bayer">{t('Bayer (even dot pattern)')}</option>
            </select>
          </div>
          <label class="check">
            <input type="checkbox" checked={a.invert} onChange={() => commit({ invert: !a.invert })} /> {t('Invert black/white')}
          </label>
        </>
      )}
    </div>
  );
}
