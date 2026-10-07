// Mirrors firmware/src/display/presets.cpp. Only what the editor needs: geometry and color.

export type ColorMode = 'rgb565' | 'mono';

export interface DisplayPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  color: ColorMode;
  round: boolean;
  rotation?: number; // quarter turns (firmware numbering); width/height are already swapped for 1/3
}

export const PRESETS: DisplayPreset[] = [
  { id: 'st7735s_80x160', name: 'TFT 0.96" 80×160', width: 160, height: 80, color: 'rgb565', round: false },
  { id: 'st7789_240x240', name: 'TFT 1.3" 240×240', width: 240, height: 240, color: 'rgb565', round: false },
  { id: 'gc9a01_240_round', name: 'Round TFT 1.28" 240×240', width: 240, height: 240, color: 'rgb565', round: true },
  { id: 'ssd1306_128x64', name: 'OLED 0.96" 128×64', width: 128, height: 64, color: 'mono', round: false },
  { id: 'ssd1306_128x32', name: 'OLED 0.91" 128×32', width: 128, height: 32, color: 'mono', round: false },
];

// A display id may carry the rotation the animation is made for: "st7789_240x240@1" is the
// 1.3" panel turned one quarter (90°). Geometry from getPreset() is always the rotated one.
export function basePresetId(id: string): string {
  return id.split('@')[0];
}

export function presetRotation(id: string): number {
  return Number(id.split('@')[1] ?? 0) & 3;
}

// 1-bit panels (page memory) turn only by 180°.
export function allowedRotations(id: string): number[] {
  return getPreset(basePresetId(id)).color === 'mono' ? [0, 2] : [0, 1, 2, 3];
}

export function withRotation(id: string, rotation: number): string {
  const base = basePresetId(id);
  const r = allowedRotations(base).includes(rotation & 3) ? rotation & 3 : 0;
  return r ? `${base}@${r}` : base;
}

// Same panel, whatever the rotation.
export function sameDisplay(a: string, b: string): boolean {
  return basePresetId(a) === basePresetId(b);
}

export function getPreset(id: string): DisplayPreset {
  const base = PRESETS.find((p) => p.id === basePresetId(id)) ?? PRESETS[1];
  const rotation = presetRotation(id);
  if (!rotation) return base;
  const swap = rotation & 1;
  return { ...base, id: withRotation(base.id, rotation), rotation,
    width: swap ? base.height : base.width, height: swap ? base.width : base.height };
}

export interface CanvasOption {
  width: number;
  height: number;
  scale: number;
}

// Pixel-art canvas sizes that fill the screen with an integer scale, coarse to fine.
export function canvasOptions(p: DisplayPreset): CanvasOption[] {
  const out: CanvasOption[] = [];
  for (const scale of [8, 6, 5, 4, 3, 2, 1]) {
    const width = Math.floor(p.width / scale);
    const height = Math.floor(p.height / scale);
    if (width >= 8 && height >= 8) out.push({ width, height, scale });
  }
  return out;
}

// Largest integer scale at which a canvas fits on the screen (1 if it does not fit at all).
export function fitScale(p: DisplayPreset, w: number, h: number): number {
  return Math.max(1, Math.min(8, Math.floor(Math.min(p.width / w, p.height / h))));
}
