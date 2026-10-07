import { DEFAULT_ADJUST, type Frame, type Pixels, type Project } from './types';
import { fitScale, getPreset, presetRotation, withRotation } from './presets';

let nextFrameId = 1;

export function newFrame(width: number, height: number, delay = 100, data?: Pixels): Frame {
  return { id: nextFrameId++, data: data ?? new Uint8ClampedArray(width * height * 4), delay };
}

export function cloneFrame(f: Frame): Frame {
  return { id: nextFrameId++, data: f.data.slice(), delay: f.delay };
}

export function createProject(opts: {
  presetId: string;
  width: number;
  height: number;
  scale?: number;
  name?: string;
  background?: string;
  frames?: Frame[];
  source?: Project['source'];
}): Project {
  const preset = getPreset(opts.presetId);
  const scale = opts.scale ?? fitScale(preset, opts.width, opts.height);
  const p: Project = {
    name: opts.name ?? 'animation',
    presetId: preset.id,
    width: opts.width,
    height: opts.height,
    scale,
    offsetX: 0,
    offsetY: 0,
    background: opts.background ?? '#000000',
    frames: opts.frames ?? [newFrame(opts.width, opts.height)],
    loop: 0,
    adjust: { ...DEFAULT_ADJUST },
    encoding: 'auto',
    jpegQuality: 0.75,
    source: opts.source ?? 'pixel',
  };
  centerOnScreen(p);
  return p;
}

export function centerOnScreen(p: Project) {
  const preset = getPreset(p.presetId);
  p.offsetX = Math.floor((preset.width - p.width * p.scale) / 2);
  p.offsetY = Math.floor((preset.height - p.height * p.scale) / 2);
}

// Switches to the board's panel but keeps the rotation chosen for this animation.
export function useBoardDisplay(p: Project, boardPresetId: string): Project {
  return retarget(p, withRotation(boardPresetId, presetRotation(p.presetId)));
}

// Switching displays keeps the artwork and picks the largest scale that fits the new screen.
export function retarget(p: Project, presetId: string): Project {
  const next = { ...p, presetId };
  next.scale = fitScale(getPreset(presetId), p.width, p.height);
  centerOnScreen(next);
  return next;
}

export function totalDuration(p: Project): number {
  return p.frames.reduce((s, f) => s + f.delay, 0);
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
