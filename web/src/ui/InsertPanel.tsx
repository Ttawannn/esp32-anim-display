// "Insert" tab: date/time, text, icons and emoji. Drag a tile onto the canvas (or click it to add
// in the middle), then move / resize it with the select tool and tweak it here.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { EMOJI, EMOJI_FONT, emojiList, FONTS, ICONS } from '../layers/catalog';
import { CLOCK_PRESETS, clockTimeOf, formatClock } from '../layers/clock';
import { widgetsFor } from '../layers/raster';
import {
  addLayer, bakeLayer, canvasScreenRect, duplicateLayer, INSERT_MIME, layersOf, moveLayerOrder, removeLayer,
  updateLayer, type InsertItem,
} from '../model/layers';
import { getPreset } from '../model/presets';
import { store, type EditorState } from '../model/store';
import type { ClockLayer, FontId, Layer, StickerLayer } from '../model/types';
import { Icon, IconButton, Slider } from './common';
import { getLang, t } from '../i18n';

function Tile(props: { item: InsertItem; title: string; class?: string; children: ComponentChildren }) {
  return (
    <button class={`ins-tile ${props.class ?? ''}`} title={t('{title} — drag onto the picture, or click to add it in the middle', { title: props.title })} draggable
      onDragStart={(e) => {
        e.dataTransfer!.setData(INSERT_MIME, JSON.stringify(props.item));
        e.dataTransfer!.effectAllowed = 'copy';
      }}
      onClick={() => addLayer(props.item)}>
      {props.children}
    </button>
  );
}

// Formats in the UI language come before the other language's.
function clockPresets() {
  const lang = getLang();
  return [...CLOCK_PRESETS].sort((a, b) => Number(!!a.lang && a.lang !== lang) - Number(!!b.lang && b.lang !== lang));
}

function IconPreview({ name, size = 26, color = '#e9ecf3' }: { name: string; size?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, ref.current!.width, ref.current!.height);
    c.scale((size * dpr) / 100, (size * dpr) / 100);
    c.fillStyle = c.strokeStyle = color;
    ICONS.find((i) => i.id === name)?.draw(c);
  }, [name, color, size]);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return <canvas ref={ref} width={size * dpr} height={size * dpr} style={{ width: size, height: size }} />;
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function InsertPanel({ s }: { s: EditorState }) {
  const p = s.project;
  const layers = layersOf(p);
  const selected = layers.find((l) => l.id === s.selectedLayer) ?? null;
  const [cat, setCat] = useState(EMOJI[0].id);
  const now = useNow(1000);
  const time = clockTimeOf(now);

  return (
    <div class="insert">
      {selected && <LayerProps s={s} layer={selected} />}

      <h4 class="ins-h"><Icon name="clock" /> {t('Date & time')} <small>{t('runs live on the board')}</small></h4>
      <div class="ins-grid clocks">
        {clockPresets().map((c) => (
          <Tile key={c.id} item={{ type: 'clock', format: c.format }} title={t(c.label)} class="clock">
            <b>{formatClock(c.format, time)}</b><small>{t(c.label)}</small>
          </Tile>
        ))}
      </div>

      <h4 class="ins-h"><Icon name="text" /> {t('Text')}</h4>
      <div class="ins-grid">
        <Tile item={{ type: 'text' }} title={t('Text')} class="wide"><b style={{ fontSize: 18 }}>Aa</b><small>{t('Type your own text')}</small></Tile>
      </div>

      <h4 class="ins-h"><Icon name="star" /> {t('Icons')}</h4>
      <div class="ins-grid icons">
        {ICONS.map((i) => (
          <Tile key={i.id} item={{ type: 'icon', name: i.id }} title={t(i.label)}><IconPreview name={i.id} /></Tile>
        ))}
      </div>

      <h4 class="ins-h"><Icon name="smile" /> {t('Emoji')}</h4>
      <div class="chips">
        {EMOJI.map((c) => (
          <button key={c.id} class={`chip-btn${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)}>{t(c.label)}</button>
        ))}
      </div>
      <div class="ins-grid emoji">
        {emojiList(EMOJI.find((c) => c.id === cat)!.items).map((e) => (
          <Tile key={e} item={{ type: 'emoji', char: e }} title={e}><span style={{ fontFamily: EMOJI_FONT }}>{e}</span></Tile>
        ))}
      </div>

      {layers.length > 0 && (
        <>
          <h4 class="ins-h"><Icon name="layers" /> {t('On the picture ({n})', { n: layers.length })}</h4>
          <div class="layer-list">
            {[...layers].reverse().map((l) => (
              <button key={l.id} class={`layer-row${l.id === s.selectedLayer ? ' active' : ''}`}
                onClick={() => store.set({ selectedLayer: l.id, tool: 'select' })}>
                <span class="layer-ico">{layerIcon(l)}</span>
                <span class="grow">{layerLabel(l, time)}</span>
                <span class="del" role="button" title={t('Delete')} onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }}>
                  <Icon name="trash" />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function layerIcon(l: Layer) {
  if (l.kind === 'clock') return <Icon name="clock" />;
  if (l.source.type === 'emoji') return <span style={{ fontFamily: EMOJI_FONT }}>{l.source.char}</span>;
  if (l.source.type === 'icon') return <IconPreview name={l.source.name} size={16} color={l.color} />;
  return <Icon name="text" />;
}

function layerLabel(l: Layer, time: ReturnType<typeof clockTimeOf>): string {
  if (l.kind === 'clock') return formatClock(l.format, time) || l.format;
  if (l.source.type === 'text') return l.source.text || t('Text');
  if (l.source.type === 'icon') return t(ICONS.find((i) => i.id === (l.source as { name: string }).name)?.label ?? 'Icon');
  return t('Emoji');
}

// ---------------------------------------------------------------------------------------------

function LayerProps({ s, layer }: { s: EditorState; layer: Layer }) {
  const p = s.project;
  const mono = getPreset(p.presetId).color === 'mono';
  const live = (patch: Partial<StickerLayer> | Partial<ClockLayer>) => updateLayer(layer.id, patch, true);
  const set = (patch: Partial<StickerLayer> | Partial<ClockLayer>) => updateLayer(layer.id, patch);
  const end = () => store.endLive();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), [layer.id]);
  const title = layer.kind === 'clock' ? t('Clock / date')
    : layer.source.type === 'emoji' ? t('Emoji') : layer.source.type === 'icon' ? t('Icon') : t('Text');

  return (
    <div class="layer-props" ref={ref}>
      <div class="row">
        <b class="grow">{title}</b>
        <IconButton icon="copy" title={t('Duplicate')} onClick={() => duplicateLayer(layer.id)} />
        <IconButton icon="front" title={t('Bring to front')} onClick={() => moveLayerOrder(layer.id, true)} />
        <IconButton icon="back" title={t('Send to back')} onClick={() => moveLayerOrder(layer.id, false)} />
        <IconButton icon="trash" title={t('Delete (Del)')} onClick={() => removeLayer(layer.id)} />
        <IconButton icon="check" title={t('Done (Esc)')} onClick={() => store.set({ selectedLayer: null })} />
      </div>
      {layer.kind === 'clock' ? <ClockProps s={s} layer={layer} mono={mono} live={live} set={set} end={end} />
        : <StickerProps s={s} layer={layer} mono={mono} live={live} set={set} end={end} />}
    </div>
  );
}

type PropsOf<L> = {
  s: EditorState;
  layer: L;
  mono: boolean;
  live: (patch: Partial<L>) => void;
  set: (patch: Partial<L>) => void;
  end: () => void;
};

function ColorField({ value, mono, onInput, onChange }: { value: string; mono: boolean; onInput: (v: string) => void; onChange: () => void }) {
  if (mono) {
    const on = parseInt(value.slice(1), 16) > 0x808080;
    return (
      <div class="seg two">
        <button class={on ? 'active' : ''} onClick={() => { onInput('#ffffff'); onChange(); }}>{t('On (lit)')}</button>
        <button class={!on ? 'active' : ''} onClick={() => { onInput('#000000'); onChange(); }}>{t('Off (dark)')}</button>
      </div>
    );
  }
  return (
    <label class="field">
      <span>{t('Color')}</span>
      <input type="color" value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value)} onChange={onChange} />
      <span />
    </label>
  );
}

function StickerProps({ s, layer, mono, live, set, end }: PropsOf<StickerLayer>) {
  const src = layer.source;
  const max = Math.max(s.project.width, s.project.height);
  return (
    <>
      {src.type === 'text' && (
        <>
          <input type="text" class="wide-input" value={src.text} placeholder={t('Type text')}
            onInput={(e) => live({ source: { ...src, text: (e.target as HTMLInputElement).value } })} onChange={end} />
          <div class="row">
            <select class="grow" value={src.font} onChange={(e) => set({ source: { ...src, font: (e.target as HTMLSelectElement).value as FontId } })}>
              {FONTS.map((f) => <option key={f.id} value={f.id}>{t(f.label)}</option>)}
            </select>
            <label class="check"><input type="checkbox" checked={src.bold} onChange={() => set({ source: { ...src, bold: !src.bold } })} /> {t('Bold')}</label>
          </div>
        </>
      )}
      <Slider label={t('Size')} min={4} max={max} value={layer.size} format={(v) => `${v}px`} onInput={(v) => live({ size: v })} onCommit={end} />
      {src.type !== 'emoji' && <ColorField value={layer.color} mono={mono} onInput={(v) => live({ color: v })} onChange={end} />}
      <div class="row">
        {src.type !== 'emoji' && (
          <label class="check"><input type="checkbox" checked={layer.outline} onChange={() => set({ outline: !layer.outline })} /> {t('Outline')}</label>
        )}
        <label class="check" title={t('Hard pixel edges, no blur')}><input type="checkbox" checked={layer.crisp} onChange={() => set({ crisp: !layer.crisp })} /> {t('Crisp')}</label>
      </div>
      <div class="row">
        <span class="hint grow">{t('Objects appear on every frame')}</span>
      </div>
      <div class="row">
        <button class="btn small grow" title={t('Paint it into this frame and remove it from the list')} onClick={() => bakeLayer(layer.id, false)}>
          <Icon name="stamp" /> {t('Stamp on this frame')}
        </button>
        <button class="btn small grow" title={t('Paint it into every frame and remove it from the list')} onClick={() => bakeLayer(layer.id, true)}>
          {t('Stamp on every frame')}
        </button>
      </div>
    </>
  );
}

function ClockProps({ s, layer, mono, live, set, end }: PropsOf<ClockLayer>) {
  const p = s.project;
  const preset = getPreset(p.presetId);
  const presetMatch = CLOCK_PRESETS.find((c) => c.format === layer.format);
  const [custom, setCustom] = useState(!presetMatch);
  let error = '';
  let outside = false;
  try {
    const w = widgetsFor(p);
    const i = w?.layers.findIndex((l) => l.id === layer.id) ?? -1;
    if (w && i >= 0) {
      const b = w.boxes[i], c = canvasScreenRect(p);
      outside = b.x < c.x || b.y < c.y || b.x + b.w > c.x + c.w || b.y + b.h > c.y + c.h;
    }
  } catch (e) {
    error = (e as Error).message;
  }
  const info = s.deviceInfo;
  return (
    <>
      <div class="row">
        <select class="grow" value={custom ? '' : layer.format}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            if (!v) { setCustom(true); return; }
            setCustom(false);
            set({ format: v });
          }}>
          {clockPresets().map((c) => <option key={c.id} value={c.format}>{t(c.label)} — {formatClock(c.format, clockTimeOf(new Date()))}</option>)}
          <option value="">{t('Custom format…')}</option>
        </select>
      </div>
      {custom && (
        <>
          <input type="text" class="wide-input" value={layer.format} onInput={(e) => live({ format: (e.target as HTMLInputElement).value })} onChange={end} />
          <p class="hint small-print">{t('HH hour · mm minute · ss second · d day · MMM short month · MMMM month · dddd weekday · yyyy year · BBBB Buddhist-era year · A AM/PM · L English names · [text]')}</p>
        </>
      )}
      <Slider label={t('Size')} min={6} max={preset.height} value={layer.size} format={(v) => `${v}px`} onInput={(v) => live({ size: v })} onCommit={end} />
      <ColorField value={layer.color} mono={mono} onInput={(v) => live({ color: v })} onChange={end} />
      <div class="row">
        <select class="grow" value={layer.font} onChange={(e) => set({ font: (e.target as HTMLSelectElement).value as FontId })}>
          {FONTS.map((f) => <option key={f.id} value={f.id}>{t(f.label)}</option>)}
        </select>
        <label class="check"><input type="checkbox" checked={layer.bold} onChange={() => set({ bold: !layer.bold })} /> {t('Bold')}</label>
      </div>
      <div class="seg three">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} class={layer.align === a ? 'active' : ''} onClick={() => set({ align: a })}>
            {t({ left: 'Left', center: 'Center', right: 'Right' }[a])}
          </button>
        ))}
      </div>
      {error && <div class="callout warn">{error}</div>}
      {outside && !error && <div class="callout warn">{t("Part of it is outside the picture area; the board won't show that part")}</div>}
      {info && info.time === undefined && <div class="callout warn">{t("The board's firmware doesn't support clocks yet. Update the firmware first.")}</div>}
      <p class="hint">{t('The board keeps time itself: this page or the remote sets it whenever they connect, or the board gets it from the internet on your home Wi-Fi.')}</p>
    </>
  );
}
