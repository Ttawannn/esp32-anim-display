import { asciiGrid, CHARSETS, SIZES } from '../ascii/ascii';
import { checkFrameBudget } from '../import/limits';
import { atFullResolution } from '../model/project';
import { store, toast, type EditorState } from '../model/store';
import { DEFAULT_ASCII, type AsciiCharset, type AsciiEffect, type AsciiSize } from '../model/types';
import { isMono } from '../render/output';
import { t } from '../i18n';

// ASCII art effect: non-destructive like the color adjustments, applied when previewing and exporting.
export function AsciiPanel({ s }: { s: EditorState }) {
  const { project: p } = s;
  const e = p.ascii;
  const mono = isMono(p);
  const set = (next: AsciiEffect | undefined) => store.commit({ ...p, ascii: next });
  const patch = (x: Partial<AsciiEffect>) => e && set({ ...e, ...x });
  const grid = e && asciiGrid(p.width, p.height, e.size);
  const fullResolution = () => {
    try {
      checkFrameBudget(p.width * p.scale, p.height * p.scale, p.frames.length);
      store.commit(atFullResolution(p));
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <div class="section">
      <h3>{t('ASCII art')}</h3>
      <label class="check">
        <input type="checkbox" checked={!!e} onChange={() => set(e ? undefined : { ...DEFAULT_ASCII })} />
        {t('Draw the picture with characters')}
      </label>
      {e && grid && (
        <>
          <div class="row">
            <span class="hint">{t('Characters')}</span>
            <select class="grow" value={e.charset} onChange={(ev) => patch({ charset: (ev.target as HTMLSelectElement).value as AsciiCharset })}>
              {CHARSETS.map((c) => <option key={c.id} value={c.id}>{t(c.label)}  {c.chars.trim().slice(0, 10)}</option>)}
            </select>
          </div>
          <div class="row">
            <span class="hint">{t('Character size')}</span>
            <select class="grow" value={e.size} onChange={(ev) => patch({ size: (ev.target as HTMLSelectElement).value as AsciiSize })}>
              {SIZES.map((z) => <option key={z.id} value={z.id}>{t(z.label)}</option>)}
            </select>
          </div>
          {!mono && (
            <div class="row">
              <span class="hint">{t('Character color')}</span>
              <select class="grow" value={e.color} onChange={(ev) => patch({ color: (ev.target as HTMLSelectElement).value as AsciiEffect['color'] })}>
                <option value="image">{t('From the picture')}</option>
                <option value="solid">{t('One color')}</option>
              </select>
              {e.color === 'solid' && (
                <input type="color" value={e.ink} title={t('Character color')}
                  onInput={(ev) => patch({ ink: (ev.target as HTMLInputElement).value })} />
              )}
            </div>
          )}
          <p class="hint">
            {t('{cols} × {rows} characters. The background color fills the space between them.', { cols: grid.cols, rows: grid.rows })}
            {mono && ' ' + t('Threshold and dither are not used while ASCII art is on.')}
          </p>
          {p.scale > 1 && (
            <>
              <p class="hint">{t('The screen shows this canvas ×{scale}, so every character is {scale} times larger. Switch to full resolution for smaller characters and more of them.', { scale: p.scale })}</p>
              <button class="btn" onClick={fullResolution}>{t('Use full screen resolution')}</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
