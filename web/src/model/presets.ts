// Mirrors firmware/src/display/presets.cpp. Only what the editor needs: geometry and color.

export type ColorMode = 'rgb565' | 'mono';

export interface DisplayPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  color: ColorMode;
  round: boolean;
}

export const PRESETS: DisplayPreset[] = [
  { id: 'st7735s_80x160', name: 'TFT 0.96" 80×160', width: 80, height: 160, color: 'rgb565', round: false },
  { id: 'st7789_240x240', name: 'TFT 1.3" 240×240', width: 240, height: 240, color: 'rgb565', round: false },
  { id: 'gc9a01_240_round', name: 'TFT กลม 1.28" 240×240', width: 240, height: 240, color: 'rgb565', round: true },
  { id: 'ssd1306_128x64', name: 'OLED 0.96" 128×64', width: 128, height: 64, color: 'mono', round: false },
  { id: 'ssd1306_128x32', name: 'OLED 0.91" 128×32', width: 128, height: 32, color: 'mono', round: false },
];

export function getPreset(id: string): DisplayPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[1];
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
