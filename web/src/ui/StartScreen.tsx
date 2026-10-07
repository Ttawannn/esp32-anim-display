import { useEffect, useState } from 'preact/hooks';
import { getPreset } from '../model/presets';
import { store, type EditorState } from '../model/store';
import { TEMPLATES } from '../templates/gallery';
import { Icon } from './common';
import { openTemplates, Thumb } from './TemplatesDialog';
import { openProjectFile } from './TopBar';
import { t } from '../i18n';

// A few of every kind, so the range is visible at a glance; the rest are one click away.
const PICKS = ['clock', 'eyes-look-lr', 'eyes-happy', 'eyes-love', 'fire', 'heart', 'stars', 'fireworks', 'rain', 'marquee'];

const OTHER: { icon: string; title: string; run: () => void }[] = [
  { icon: 'pencil', title: 'Draw', run: () => store.set({ startDismissed: true }) },
  { icon: 'image', title: 'Import GIF', run: () => store.set({ dialog: 'gif' }) },
  { icon: 'film', title: 'Import video', run: () => store.set({ dialog: 'video' }) },
  { icon: 'folder', title: 'Open project', run: openProjectFile },
];

// Shown over the canvas while the project is still empty.
export function StartScreen({ s }: { s: EditorState }) {
  const preset = getPreset(s.project.presetId);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 90);
    return () => clearInterval(i);
  }, []);
  const picks = PICKS.map((id) => TEMPLATES.find((x) => x.id === id)!).filter(Boolean);
  return (
    <div class="start">
      <div class="start-card">
        <h1>{t('Start an animation')}</h1>
        <p class="hint">
          {t('For the')} <b>{preset.name}</b>{' '}
          <button class="link" onClick={() => store.set({ dialog: 'new' })}>{t('Change display')}</button>
        </p>
        <div class="start-picks">
          {picks.map((tpl) => (
            <button key={tpl.id} class="start-pick" onClick={() => openTemplates(tpl.id)} title={t(tpl.hint)}>
              <div class="tpl-thumb"><Thumb tpl={tpl} presetId={s.project.presetId} tick={tick} /></div>
              <span class="name"><Icon name={tpl.icon} /> {t(tpl.name)}</span>
            </button>
          ))}
        </div>
        <button class="btn primary big start-all" onClick={() => openTemplates()}>
          <Icon name="wand" /> {t('See all {n} templates', { n: TEMPLATES.length })}
        </button>
        <div class="start-other">
          <span class="hint">{t('Or start from')}</span>
          {OTHER.map((o) => (
            <button key={o.title} class="btn" onClick={o.run}><Icon name={o.icon} /> {t(o.title)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

const blankCache = new WeakMap<Uint8ClampedArray, boolean>();

export function isBlankProject(s: EditorState): boolean {
  const frames = s.project.frames;
  if (frames.length !== 1) return false;
  const data = frames[0].data;
  let blank = blankCache.get(data);
  if (blank === undefined) {
    blank = true;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]) {
        blank = false;
        break;
      }
    }
    blankCache.set(data, blank);
  }
  return blank;
}
