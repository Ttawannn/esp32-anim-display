import { getPreset } from '../model/presets';
import { store, type EditorState } from '../model/store';
import { Icon } from './common';
import { openTemplates } from './TemplatesDialog';
import { openProjectFile } from './TopBar';
import { t } from '../i18n';

const CARDS: { icon: string; title: string; text: string; badge?: string; run: () => void }[] = [
  { icon: 'wand', title: 'Animation templates', text: 'Fire, rain, stars, fireworks, scrolling text and 20+ more', badge: 'New', run: () => openTemplates() },
  { icon: 'eye', title: 'Eye templates', text: '12 eye moods, ready to send to the screen', run: () => store.set({ dialog: 'eyes' }) },
  { icon: 'clock', title: 'Digital clock', text: 'Live time and date on the screen', run: () => openTemplates('clock') },
  { icon: 'pencil', title: 'Draw', text: 'Draw pixel art frame by frame', run: () => store.set({ startDismissed: true }) },
  { icon: 'image', title: 'Import GIF', text: 'Use an animation you already have', run: () => store.set({ dialog: 'gif' }) },
  { icon: 'film', title: 'Import video', text: 'Play a short clip on the screen', run: () => store.set({ dialog: 'video' }) },
];

// Shown over the canvas while the project is still empty.
export function StartScreen({ s }: { s: EditorState }) {
  const preset = getPreset(s.project.presetId);
  return (
    <div class="start">
      <div class="start-card">
        <h1>{t('Start an animation')}</h1>
        <p class="hint">
          {t('For the')} <b>{preset.name}</b>{' '}
          <button class="link" onClick={() => store.set({ dialog: 'new' })}>{t('Change display')}</button>
        </p>
        <div class="start-grid">
          {CARDS.map((c) => (
            <button key={c.title} class="start-option" onClick={c.run}>
              <span class="start-ico"><Icon name={c.icon} /></span>
              <span class="title">{t(c.title)}{c.badge && <span class="pill">{t(c.badge)}</span>}</span>
              <span class="text">{t(c.text)}</span>
            </button>
          ))}
        </div>
        <button class="link" onClick={openProjectFile}>{t('or open a saved project (.dpe)')}</button>
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
