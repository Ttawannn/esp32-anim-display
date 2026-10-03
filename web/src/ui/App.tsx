import { useEffect } from 'preact/hooks';
import { autoConnect, sendLiveFrame } from '../device/session';
import { addFrame, deleteFrame, selectFrame, store, useEditor } from '../model/store';
import { AdjustPanel } from './AdjustPanel';
import { DeviceDialog } from './DeviceDialog';
import { EditorCanvas } from './EditorCanvas';
import { EyesDialog } from './EyesDialog';
import { ImportGifDialog } from './ImportGifDialog';
import { ImportVideoDialog } from './ImportVideoDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { OutputPanel } from './OutputPanel';
import { PalettePanel } from './PalettePanel';
import { PreviewPanel } from './PreviewPanel';
import { Timeline } from './Timeline';
import { ToolBar, TOOLS } from './ToolBar';
import { TopBar } from './TopBar';

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA';
}

export function App() {
  const s = useEditor();

  useEffect(() => {
    autoConnect();
  }, []);

  // Live preview: mirror the current frame on the board shortly after each change.
  const liveFrame = s.project.frames[s.frameIndex];
  useEffect(() => {
    if (!s.live) return;
    const t = setTimeout(sendLiveFrame, 120);
    return () => clearTimeout(t);
  }, [s.live, liveFrame, s.project.adjust, s.project.background, s.project.presetId]);

  // Playback: advance frames using each frame's own delay.
  useEffect(() => {
    if (!s.playing) return;
    const frame = s.project.frames[s.frameIndex];
    const t = setTimeout(() => selectFrame((s.frameIndex + 1) % s.project.frames.length), frame.delay);
    return () => clearTimeout(t);
  }, [s.playing, s.frameIndex, s.project]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || store.state.dialog) return;
      const st = store.state;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
      if (ctrl && key === 'y') { e.preventDefault(); store.redo(); return; }
      if (ctrl) return;
      if (e.key === ' ') { e.preventDefault(); store.set({ playing: !st.playing }); return; }
      if (e.key === 'ArrowLeft' || e.key === ',') { selectFrame(st.frameIndex - 1); return; }
      if (e.key === 'ArrowRight' || e.key === '.') { selectFrame(st.frameIndex + 1); return; }
      if (e.key === 'Delete') { deleteFrame(); return; }
      if (key === 'd') { addFrame(true); return; }
      if (key === 'n') { addFrame(false); return; }
      if (key === 'x') { store.set({ primary: st.secondary, secondary: st.primary }); return; }
      if (key === '+' || key === '=') { store.set({ zoom: Math.min(40, (st.zoom || 4) + 1) }); return; }
      if (key === '-') { store.set({ zoom: Math.max(1, (st.zoom || 4) - 1) }); return; }
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (tool) store.set({ tool: tool.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="app">
      <TopBar s={s} />
      <div class="main">
        <ToolBar s={s} />
        <EditorCanvas s={s} />
        <div class="side">
          <PreviewPanel s={s} />
          <PalettePanel s={s} />
          <AdjustPanel s={s} />
          <OutputPanel s={s} />
        </div>
      </div>
      <Timeline s={s} />
      {s.dialog === 'new' && <NewProjectDialog />}
      {s.dialog === 'gif' && <ImportGifDialog />}
      {s.dialog === 'video' && <ImportVideoDialog />}
      {s.dialog === 'eyes' && <EyesDialog />}
      {s.dialog === 'device' && <DeviceDialog />}
      {s.toast && <div class={`toast${s.toast.error ? ' error' : ''}`}>{s.toast.text}</div>}
    </div>
  );
}
