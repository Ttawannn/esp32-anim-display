import { useEffect, useReducer } from 'preact/hooks';
import type { DeviceInfo } from '../device/api';
import type { Tool } from '../editor/tools';
import { idbGet, idbSet } from '../storage/idb';
import { cloneFrame, createProject, newFrame } from './project';
import type { Frame, OledTint, Project } from './types';
import type { Pixels } from './types';

export type Dialog = null | 'new' | 'gif' | 'video' | 'eyes' | 'device';

export interface EditorState {
  project: Project;
  frameIndex: number;
  tool: Tool;
  primary: string;
  secondary: string;
  brush: number;
  filled: boolean;
  mirror: boolean;
  grid: boolean;
  onion: boolean;
  zoom: number; // 0 = fit to view
  playing: boolean;
  paletteName: string;
  oledTint: OledTint;
  deviceHost: string;
  deviceInfo: DeviceInfo | null; // last /api/info from the board, null = not connected
  live: boolean; // mirror the current frame on the board while editing
  dialog: Dialog;
  toast: { text: string; error?: boolean } | null;
  busy: string | null;
}

type Listener = () => void;
const UNDO_LIMIT = 80;

class Store {
  state: EditorState;
  private listeners = new Set<Listener>();
  private undoStack: { project: Project; frameIndex: number }[] = [];
  private redoStack: { project: Project; frameIndex: number }[] = [];
  private saveTimer: number | undefined;

  constructor() {
    this.state = {
      project: createProject({ presetId: 'st7789_240x240', width: 60, height: 60, scale: 4 }),
      frameIndex: 0,
      tool: 'pencil',
      primary: '#ff004d',
      secondary: '#000000',
      brush: 1,
      filled: false,
      mirror: false,
      grid: true,
      onion: false,
      zoom: 0,
      playing: false,
      paletteName: 'PICO-8',
      oledTint: 'white',
      deviceHost: '',
      deviceInfo: null,
      live: false,
      dialog: null,
      toast: null,
      busy: null,
    };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  // Project changes that can be undone.
  commit(project: Project, frameIndex = this.state.frameIndex) {
    this.undoStack.push({ project: this.state.project, frameIndex: this.state.frameIndex });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.set({ project, frameIndex: clampIndex(frameIndex, project) });
    this.scheduleSave();
  }

  // Continuous edits (slider drags): show changes immediately, record one undo step at the end.
  private liveBase: { project: Project; frameIndex: number } | null = null;

  setLive(project: Project) {
    this.liveBase ??= { project: this.state.project, frameIndex: this.state.frameIndex };
    this.set({ project });
  }

  endLive() {
    if (!this.liveBase) return;
    this.undoStack.push(this.liveBase);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.liveBase = null;
    this.scheduleSave();
  }

  // Replaces the project and clears history (new / open / import).
  load(project: Project) {
    this.undoStack = [];
    this.redoStack = [];
    this.set({ project, frameIndex: 0 });
    this.scheduleSave();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push({ project: this.state.project, frameIndex: this.state.frameIndex });
    this.set(prev);
    this.scheduleSave();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push({ project: this.state.project, frameIndex: this.state.frameIndex });
    this.set(next);
    this.scheduleSave();
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      idbSet('project', this.state.project).catch(() => {});
    }, 800);
  }

  async restore() {
    try {
      const saved = await idbGet<Project>('project');
      if (saved?.frames?.length) {
        saved.frames = saved.frames.map((f) => newFrame(saved.width, saved.height, f.delay, f.data));
        this.load(saved);
      }
      const prefs = await idbGet<Partial<EditorState>>('prefs');
      if (prefs) this.set(prefs);
    } catch {
      /* first run or storage blocked */
    }
  }

  savePrefs() {
    const { primary, secondary, paletteName, oledTint, deviceHost, grid, onion } = this.state;
    idbSet('prefs', { primary, secondary, paletteName, oledTint, deviceHost, grid, onion }).catch(() => {});
  }
}

function clampIndex(i: number, p: Project) {
  return Math.max(0, Math.min(p.frames.length - 1, i));
}

export const store = new Store();

export function useEditor(): EditorState {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const unsubscribe = store.subscribe(() => force(0));
    return () => {
      unsubscribe();
    };
  }, []);
  return store.state;
}

export function toast(text: string, error = false) {
  store.set({ toast: { text, error } });
  setTimeout(() => {
    if (store.state.toast?.text === text) store.set({ toast: null });
  }, error ? 6000 : 2500);
}

// ---------------------------------------------------------------------------------------------
// Frame actions

export function updateProject(patch: Partial<Project>) {
  store.commit({ ...store.state.project, ...patch });
}

export function setFrameData(index: number, data: Pixels) {
  const p = store.state.project;
  const frames = p.frames.slice();
  frames[index] = { ...frames[index], data };
  store.commit({ ...p, frames }, index);
}

export function mapAllFrames(fn: (f: Frame) => Pixels | null) {
  const p = store.state.project;
  let changed = false;
  const frames = p.frames.map((f) => {
    const d = fn(f);
    if (!d) return f;
    changed = true;
    return { ...f, data: d };
  });
  if (changed) store.commit({ ...p, frames });
  return changed;
}

export function addFrame(duplicate: boolean) {
  const { project: p, frameIndex: i } = store.state;
  const cur = p.frames[i];
  const f = duplicate ? cloneFrame(cur) : newFrame(p.width, p.height, cur.delay);
  const frames = p.frames.slice();
  frames.splice(i + 1, 0, f);
  store.commit({ ...p, frames }, i + 1);
}

export function deleteFrame() {
  const { project: p, frameIndex: i } = store.state;
  if (p.frames.length <= 1) {
    setFrameData(0, new Uint8ClampedArray(p.width * p.height * 4));
    return;
  }
  const frames = p.frames.slice();
  frames.splice(i, 1);
  store.commit({ ...p, frames }, Math.min(i, frames.length - 1));
}

export function moveFrame(delta: number) {
  const { project: p, frameIndex: i } = store.state;
  const j = i + delta;
  if (j < 0 || j >= p.frames.length) return;
  const frames = p.frames.slice();
  [frames[i], frames[j]] = [frames[j], frames[i]];
  store.commit({ ...p, frames }, j);
}

export function setDelay(ms: number, all: boolean) {
  const { project: p, frameIndex: i } = store.state;
  const delay = Math.max(10, Math.min(10000, Math.round(ms)));
  const frames = p.frames.map((f, k) => (all || k === i ? { ...f, delay } : f));
  store.commit({ ...p, frames });
}

export function selectFrame(i: number) {
  store.set({ frameIndex: clampIndex(i, store.state.project) });
}
