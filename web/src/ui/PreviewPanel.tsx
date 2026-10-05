import { useEffect, useRef, useState } from 'preact/hooks';
import { clockTimeOf, usesSeconds } from '../layers/clock';
import { widgetsFor } from '../layers/raster';
import { presetForDevice } from '../device/api';
import { getPreset, PRESETS } from '../model/presets';
import { retarget } from '../model/project';
import { store, type EditorState } from '../model/store';
import type { OledTint } from '../model/types';
import { isMono, outputFrame } from '../render/output';
import { composeScreen } from '../render/screen';
import { t } from '../i18n';

// Shows the current frame exactly as the panel will: RGB565 / 1-bit, scaling, offset, round mask.
export function PreviewPanel({ s }: { s: EditorState }) {
  const { project: p } = s;
  const preset = getPreset(p.presetId);
  const ref = useRef<HTMLCanvasElement>(null);
  // Fit a 180px box (fractional zoom is fine with pixelated scaling) so the tabs below stay in view.
  const zoom = Math.min(180 / preset.width, 180 / preset.height);
  const mono = isMono(p);
  const boardPreset = s.deviceInfo ? presetForDevice(s.deviceInfo) : null;
  const [unlocked, setUnlocked] = useState(false);
  const following = !!boardPreset && boardPreset === p.presetId && !unlocked;

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
      <h3>{t('Display preview')}</h3>
      {following ? (
        // Connected to a board: the target display is the board's, no need to choose.
        <div class="row board-display">
          <span class="dot on" />
          <span class="grow">{t("Board's display:")} <b>{preset.name}</b></span>
          <button class="link" onClick={() => setUnlocked(true)} title={t('Make something for another display, not the one on this board')}>{t('Another display')}</button>
        </div>
      ) : (
        <>
          <div class="row">
            <select class="grow" value={p.presetId} title={t('Display type')}
              onChange={(e) => store.commit(retarget(p, (e.target as HTMLSelectElement).value))}>
              {PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </select>
          </div>
          {boardPreset && boardPreset !== p.presetId && (
            <div class="callout warn">
              <span class="grow">{t('The connected board has the {display}', { display: getPreset(boardPreset).name })}</span>
              <button class="btn small" onClick={() => { store.commit(retarget(p, boardPreset)); setUnlocked(false); }}>{t("Use the board's display")}</button>
            </div>
          )}
        </>
      )}
      <div class="device">
        <div class={`bezel${preset.round ? ' round' : ''}`}>
          <canvas ref={ref} width={preset.width} height={preset.height}
            style={{ width: preset.width * zoom, height: preset.height * zoom }} />
        </div>
      </div>
      <div class="preview-info">
        {preset.width}×{preset.height} · {mono ? t('1-bit mono') : t('RGB565 color')}
      </div>
      {mono && (
        <div class="row" style={{ justifyContent: 'center' }}>
          <span class="hint">{t('OLED color')}</span>
          <select value={s.oledTint} onChange={(e) => {
            store.set({ oledTint: (e.target as HTMLSelectElement).value as OledTint });
            store.savePrefs();
          }}>
            <option value="white">{t('White')}</option>
            <option value="blue">{t('Blue')}</option>
            <option value="yellow-blue">{t('Yellow-blue (two-color)')}</option>
          </select>
        </div>
      )}
    </div>
  );
}
