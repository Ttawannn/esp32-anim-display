import { DEFAULT_ADJUST, type Frame, type Pixels, type Project } from './types';
import { fitScale, getPreset, presetRotation, withRotation } from './presets';

let nextFrameId = 1;

export function newFrame(width: number, height: number, delay = 100, data?: Pixels): Frame {
  return { id: nextFrameId++, data: data ?? new Uint8ClampedArray(width * height * 4), delay };
}

export function cloneFrame(f: Frame): Frame {
  return { id: nextFrameId++, data: f.data.slice(), delay: f.delay, ...(f.cels && { cels: f.cels }) }; // cels are shared
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

// The same picture at scale 1: every canvas pixel becomes scale × scale pixels, so effects that
// need the screen's own resolution (ASCII art) have room to work. Paint layers and stickers keep
// their place and size; clocks are already in screen pixels.
export function atFullResolution(p: Project): Project {
  const k = p.scale;
  if (k === 1) return p;
  const w0 = p.width, w = w0 * k, h = p.height * k;
  const up = (src: Pixels): Pixels => {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let sy = 0; sy < p.height; sy++) {
      const row = sy * k * w * 4;
      for (let x = 0; x < w; x++) {
        const s = (sy * w0 + ((x / k) | 0)) * 4, d = row + x * 4;
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
      }
      for (let r = 1; r < k; r++) out.copyWithin(row + r * w * 4, row, row + w * 4);
    }
    return out;
  };
  return {
    ...p, width: w, height: h, scale: 1,
    frames: p.frames.map((f) => ({ ...f, data: up(f.data) })),
    ...(p.layers && {
      layers: p.layers.map((l) =>
        l.kind === 'paint' ? { ...l, x: l.x * k, y: l.y * k, scale: l.scale * k }
        : l.kind === 'sticker' ? { ...l, x: l.x * k, y: l.y * k, size: l.size * k }
        : l),
    }),
  };
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
