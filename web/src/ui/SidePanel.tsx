import { store, type EditorState } from '../model/store';
import { AdjustPanel } from './AdjustPanel';
import { InsertPanel } from './InsertPanel';
import { Icon } from './common';
import { OutputPanel } from './OutputPanel';
import { PalettePanel } from './PalettePanel';
import { PreviewPanel } from './PreviewPanel';

const TABS: { id: EditorState['sideTab']; label: string; icon: string }[] = [
  { id: 'insert', label: 'ใส่ของ', icon: 'smile' },
  { id: 'color', label: 'สี', icon: 'palette' },
  { id: 'adjust', label: 'ปรับภาพ', icon: 'sliders' },
  { id: 'export', label: 'ส่งออก', icon: 'download' },
];

// The display preview stays on top; the rest is split into tabs so nothing needs long scrolling.
export function SidePanel({ s }: { s: EditorState }) {
  return (
    <aside class="side">
      <PreviewPanel s={s} />
      <div class="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={s.sideTab === t.id} class={`tab${s.sideTab === t.id ? ' active' : ''}`}
            onClick={() => store.set({ sideTab: t.id })}>
            <Icon name={t.icon} /> {t.label}
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
