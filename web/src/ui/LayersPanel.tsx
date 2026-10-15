// "Layers" tab: everything on the picture, top to bottom, above the background drawing. Paint
// layers are drawings that move and scale as one object; the selected one is drawn on.

import { clockTimeOf } from '../layers/clock';
import {
  addPaintLayer, bakeLayer, duplicateLayer, flipLayer, layersOf, liftToLayer, moveLayerOrder, removeLayer, scaleLayer,
  updateLayer,
} from '../model/layers';
import { store, type EditorState } from '../model/store';
import type { PaintLayer } from '../model/types';
import { Icon, IconButton, Slider } from './common';
import { LayerProps, layerIcon, layerLabel, useNow } from './InsertPanel';
import { t } from '../i18n';

export function LayersPanel({ s }: { s: EditorState }) {
  const p = s.project;
  const layers = layersOf(p);
  const selected = layers.find((l) => l.id === s.selectedLayer) ?? null;
  const time = clockTimeOf(useNow(1000));
  const select = (id: string | null) => store.set({ selectedLayer: id });

  return (
    <div class="insert">
      <div class="row">
        <button class="btn small grow" title={t('An empty layer to draw on')} onClick={addPaintLayer}>
          <Icon name="plus" /> {t('New layer')}
        </button>
        <button class="btn small grow" title={t('Move the whole drawing into a layer you can move and resize')}
          onClick={() => liftToLayer(null, s.liftAll)}>
          <Icon name="layers" /> {t('Drawing → object')}
        </button>
      </div>
      <label class="check lift-all">
        <input type="checkbox" checked={s.liftAll} onChange={() => store.set({ liftAll: !s.liftAll })} />
        {t('Take it from every frame')}
      </label>
      <p class="hint">{t('Tip: with the select tool (V), drag a box around part of the drawing to turn just that part into an object.')}</p>

      <div class="layer-list">
        {[...layers].reverse().map((l) => (
          <div key={l.id} role="button" class={`layer-row${l.id === s.selectedLayer ? ' active' : ''}${l.hidden ? ' hidden' : ''}`}
            onClick={() => select(l.id)}>
            <span class="eye" role="button" title={l.hidden ? t('Show') : t('Hide')}
              onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { hidden: !l.hidden }); }}>
              <Icon name="eye" />
            </span>
            <span class="layer-ico">{layerIcon(l)}</span>
            <span class="grow">{layerLabel(l, time)}</span>
            <span class="del" role="button" title={t('Delete')} onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }}>
              <Icon name="trash" />
            </span>
          </div>
        ))}
        <div role="button" class={`layer-row${s.selectedLayer === null ? ' active' : ''}`} onClick={() => select(null)}>
          <span class="eye" />
          <span class="layer-ico"><Icon name="image" /></span>
          <span class="grow">{t('Background drawing')}</span>
        </div>
      </div>

      {selected?.kind === 'paint' && <PaintProps s={s} layer={selected} />}
      {selected && selected.kind !== 'paint' && <div class="layer-gap"><LayerProps s={s} layer={selected} /></div>}
    </div>
  );
}

function PaintProps({ s, layer }: { s: EditorState; layer: PaintLayer }) {
  const hasPixels = !!s.project.frames[s.frameIndex].cels?.[layer.id];
  return (
    <div class="layer-props layer-gap">
      <div class="row">
        <input type="text" class="grow" value={layer.name} aria-label={t('Layer name')}
          onChange={(e) => updateLayer(layer.id, { name: (e.target as HTMLInputElement).value.trim() || layer.name })} />
        <IconButton icon="check" title={t('Done (Esc)')} onClick={() => store.set({ selectedLayer: null })} />
      </div>
      <div class="row">
        <IconButton icon="copy" title={t('Duplicate')} onClick={() => duplicateLayer(layer.id)} />
        <IconButton icon="front" title={t('Bring to front')} onClick={() => moveLayerOrder(layer.id, true)} />
        <IconButton icon="back" title={t('Send to back')} onClick={() => moveLayerOrder(layer.id, false)} />
        <IconButton icon="flipH" title={t('Flip horizontally (this frame)')} disabled={!hasPixels} onClick={() => flipLayer(layer.id, true)} />
        <IconButton icon="flipV" title={t('Flip vertically (this frame)')} disabled={!hasPixels} onClick={() => flipLayer(layer.id, false)} />
        <IconButton icon="trash" title={t('Delete (Del)')} onClick={() => removeLayer(layer.id)} />
      </div>
      <Slider label={t('Size')} min={25} max={800} step={5} value={Math.round(layer.scale * 100)} format={(v) => `${v}%`}
        onInput={(v) => scaleLayer(layer.id, v / 100, true)} onCommit={() => store.endLive()} />
      <div class="row">
        {[1, 2, 3, 4].map((k) => (
          <button key={k} class={`btn small grow${layer.scale === k ? ' active' : ''}`} onClick={() => scaleLayer(layer.id, k)}>{k}×</button>
        ))}
      </div>
      <p class="hint">{t('Drawing tools now draw on this layer. Drag it with the select tool (V) to move it on every frame; the move tool (M) moves only this frame.')}</p>
      <div class="row">
        <button class="btn small grow" title={t('Paint it into the background drawing on this frame')} onClick={() => bakeLayer(layer.id, false)}>
          <Icon name="stamp" /> {t('Stamp on this frame')}
        </button>
        <button class="btn small grow" title={t('Paint it into the background drawing on every frame and remove the layer')} onClick={() => bakeLayer(layer.id, true)}>
          {t('Stamp on every frame')}
        </button>
      </div>
    </div>
  );
}
