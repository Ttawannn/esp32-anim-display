// Frames are RGBA at canvas resolution. Frame pixel buffers are treated as immutable: every edit
// replaces the buffer, so undo snapshots can share unchanged frames by reference.
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface Frame {
  id: number;
  data: Pixels; // the background drawing
  delay: number; // ms
  cels?: Record<string, Cel>; // paint layer pixels on this frame, keyed by layer id (missing = empty)
}

// A paint layer's pixels on one frame: a trimmed bitmap placed in layer pixels (relative to the
// layer's origin, before its scale). Cels are immutable like frames: edits replace the cel, and
// moving a cel keeps its data buffer.
export interface Cel {
  x: number;
  y: number;
  w: number;
  h: number;
  data: Pixels;
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
  layers?: Layer[]; // layers on top of the background drawing (absent in older projects)
}

// ---------------------------------------------------------------------------------------------
// Layers: things placed on top of the background drawing, editable after placing.
//   paint:   a drawing that moves and scales as one object, with its own pixels on each frame (cels).
//   sticker: emoji / icon / text, rasterized at canvas resolution and baked into every frame.
//   clock:   date/time text drawn live by the board (screen resolution), see layers/widgets.ts.
// Paint layers and stickers are composited in list order; clocks are always on top (the board
// draws them over the finished frame).

export type FontId = 'sans' | 'round' | 'serif' | 'mono' | 'pixel';

export type StickerSource =
  | { type: 'emoji'; char: string }
  | { type: 'icon'; name: string }
  | { type: 'text'; text: string; font: FontId; bold: boolean };

export interface PaintLayer {
  kind: 'paint';
  id: string;
  name: string;
  x: number; // origin, canvas pixels
  y: number;
  scale: number; // nearest-neighbour enlargement of the layer pixels (1 = as drawn)
  hidden?: boolean;
}

export interface StickerLayer {
  kind: 'sticker';
  id: string;
  hidden?: boolean;
  x: number; // top-left, canvas pixels
  y: number;
  size: number; // height in canvas pixels
  color: string; // icons and text (emoji keep their own colors)
  outline: boolean; // dark outline for readability (text and icons)
  crisp: boolean; // hard pixel edges instead of anti-aliasing
  source: StickerSource;
}

export interface ClockLayer {
  kind: 'clock';
  id: string;
  hidden?: boolean;
  x: number; // top-left of the text box, screen pixels
  y: number;
  size: number; // text height in screen pixels
  color: string;
  font: FontId;
  bold: boolean;
  align: 'left' | 'center' | 'right';
  format: string; // tokens, see layers/clock.ts
}

export type Layer = PaintLayer | StickerLayer | ClockLayer;

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
