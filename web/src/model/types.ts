// Frames are RGBA at canvas resolution. Frame pixel buffers are treated as immutable: every edit
// replaces the buffer, so undo snapshots can share unchanged frames by reference.
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface Frame {
  id: number;
  data: Pixels;
  delay: number; // ms
}

export type Dither = 'none' | 'bayer' | 'floyd' | 'atkinson';
export type Encoding = 'auto' | 'indexed' | 'jpeg';
export type OledTint = 'white' | 'blue' | 'yellow-blue';

export interface ColorAdjust {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  hue: number; // -180..180 degrees
  invert: boolean;
  colors: number; // 0 = unlimited, else palette size for indexed output (2..256)
  // Mono (OLED) only
  threshold: number; // 0..255
  dither: Dither;
}

export interface Project {
  name: string;
  presetId: string;
  width: number; // canvas
  height: number;
  scale: number;
  offsetX: number; // canvas placement on the screen (after scaling)
  offsetY: number;
  background: string; // #rrggbb, fills transparent pixels and the area around the canvas
  frames: Frame[];
  loop: number; // 0 = forever
  adjust: ColorAdjust;
  encoding: Encoding;
  jpegQuality: number; // 0.3..0.95
  source: 'pixel' | 'gif' | 'video';
}

export const DEFAULT_ADJUST: ColorAdjust = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  invert: false,
  colors: 0,
  threshold: 128,
  dither: 'floyd',
};

export function isAdjustNeutral(a: ColorAdjust): boolean {
  return a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.hue === 0 && !a.invert && a.colors === 0;
}
