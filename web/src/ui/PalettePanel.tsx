import { useMemo, useState } from 'preact/hooks';
import { hexToRgba, replaceColor, usedColors } from '../editor/tools';
import { MONO_PALETTE, PALETTES } from '../model/palettes';
import { mapAllFrames, store, toast, type EditorState } from '../model/store';
import { isMono } from '../render/output';
import { Icon } from './common';
import { t } from '../i18n';

export function PalettePanel({ s }: { s: EditorState }) {
  const { project: p } = s;
  const mono = isMono(p);
  const palette = mono ? MONO_PALETTE : PALETTES.find((x) => x.name === s.paletteName) ?? PALETTES[0];
  const [selected, setSelected] = useState<string | null>(null);
  const [replaceWith, setReplaceWith] = useState('#ffffff');

  const used = useMemo(() => usedColors(p.frames.map((f) => f.data)), [p.frames]);

  const pick = (hex: string, secondary: boolean) => {
    store.set(secondary ? { secondary: hex } : { primary: hex });
    store.savePrefs();
  };

  const doReplace = () => {
    if (!selected) return;
    const from = hexToRgba(selected), to = hexToRgba(replaceWith);
    if (mapAllFrames((f) => replaceColor(f.data, from, to))) {
      toast(t('Replaced {a} with {b} in every frame', { a: selected, b: replaceWith }));
      setSelected(replaceWith);
    }
  };

  return (
    <div class="section">
      <h3>{t('Colors')}</h3>
      <div class="colors-main">
        <div class="pair" title={t('Primary (left click) / secondary (right click)')}>
          <input type="color" value={s.primary} onInput={(e) => pick((e.target as HTMLInputElement).value, false)} />
          <input type="color" value={s.secondary} onInput={(e) => pick((e.target as HTMLInputElement).value, true)} />
        </div>
        <button class="btn icon" title={t('Swap primary/secondary (X)')}
          onClick={() => store.set({ primary: s.secondary, secondary: s.primary })}>
          <Icon name="swap" />
        </button>
        {!mono && (
          <select class="grow" value={palette.name} onChange={(e) => {
            store.set({ paletteName: (e.target as HTMLSelectElement).value });
            store.savePrefs();
          }}>
            {PALETTES.map((x) => <option key={x.name} value={x.name}>{t(x.name)}</option>)}
          </select>
        )}
      </div>
      <div class="swatches" style={{ marginTop: 10 }}>
        {palette.colors.map((c) => (
          <button key={c} class={`swatch${c === s.primary ? ' sel' : ''}`} style={{ background: c }} title={c}
            onClick={() => pick(c, false)} onContextMenu={(e) => { e.preventDefault(); pick(c, true); }} />
        ))}
      </div>

      {!used.overflow && used.colors.length > 0 && (
        <>
          <div class="row" style={{ marginTop: 12 }}>
            <span class="hint">{t('Colors in the picture ({n}) — click one to replace it', { n: used.colors.length })}</span>
          </div>
          <div class="swatches">
            {used.colors.map((c) => (
              <button key={c} class={`swatch${c === selected ? ' sel' : ''}`} style={{ background: c }} title={c}
                onClick={() => { setSelected(c); pick(c, false); }} />
            ))}
          </div>
          {selected && (
            <div class="row">
              <span class="swatch" style={{ background: selected, width: 24, display: 'inline-block' }} />
              <span>→</span>
              <input type="color" value={replaceWith} onInput={(e) => setReplaceWith((e.target as HTMLInputElement).value)} />
              <button class="btn grow" onClick={doReplace}>{t('Replace in every frame')}</button>
            </div>
          )}
        </>
      )}
      {used.overflow && (
        <p class="hint">{t('The picture has more than 64 colors (e.g. a GIF or video). Use the "Adjust" tab to change its colors.')}</p>
      )}
      <div class="row" style={{ marginTop: 10 }}>
        <span class="hint">{t('Background')}</span>
        <input type="color" value={p.background} title={t('Background color (transparent parts and around the picture)')}
          onInput={(e) => store.setLive({ ...p, background: (e.target as HTMLInputElement).value })}
          onChange={() => store.endLive()} />
        <span class="hint">{t('Fills transparent parts and the area around the picture')}</span>
      </div>
    </div>
  );
}
