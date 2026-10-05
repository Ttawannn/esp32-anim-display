import { store, type EditorState } from '../model/store';
import { AdjustPanel } from './AdjustPanel';
import { InsertPanel } from './InsertPanel';
import { Icon } from './common';
import { OutputPanel } from './OutputPanel';
import { PalettePanel } from './PalettePanel';
import { PreviewPanel } from './PreviewPanel';
import { t } from '../i18n';

const TABS: { id: EditorState['sideTab']; label: string; icon: string }[] = [
  { id: 'insert', label: 'Insert', icon: 'smile' },
  { id: 'color', label: 'Colors', icon: 'palette' },
  { id: 'adjust', label: 'Adjust', icon: 'sliders' },
  { id: 'export', label: 'Export', icon: 'download' },
];

// The display preview stays on top; the rest is split into tabs so nothing needs long scrolling.
export function SidePanel({ s }: { s: EditorState }) {
  return (
    <aside class="side">
      <PreviewPanel s={s} />
      <div class="tabs" role="tablist">
        {TABS.map((tab) => (
          <button key={tab.id} role="tab" aria-selected={s.sideTab === tab.id} class={`tab${s.sideTab === tab.id ? ' active' : ''}`}
            onClick={() => store.set({ sideTab: tab.id })}>
            <Icon name={tab.icon} /> {t(tab.label)}
          </button>
        ))}
      </div>
      <div class="tab-body">
        {s.sideTab === 'insert' && <InsertPanel s={s} />}
        {s.sideTab === 'color' && <PalettePanel s={s} />}
        {s.sideTab === 'adjust' && <AdjustPanel s={s} />}
        {s.sideTab === 'export' && <OutputPanel s={s} />}
      </div>
    </aside>
  );
}
