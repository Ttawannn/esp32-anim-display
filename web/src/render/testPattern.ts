// What the board's test pattern should look like (firmware/src/display/gfx.cpp, patternShader), so
// the setup wizard can show "your screen should look like this". The board also prints the panel
// name and size as text; that is left out here.

import { from565 } from '../color/rgb565';

const BLACK = 0x0000, WHITE = 0xffff, RED = 0xf800, GREEN = 0x07e0, BLUE = 0x001f;
const CYAN = 0x07ff, MAGENTA = 0xf81f, YELLOW = 0xffe0, GRAY = 0x8410;
const BARS = [RED, GREEN, BLUE, WHITE, CYAN, MAGENTA, YELLOW, GRAY];

export function testPatternPixel(x: number, y: number, w: number, h: number, round: boolean, mono: boolean): number {
  const m = Math.max(6, Math.floor(Math.min(w, h) / 10));
  if (round) {
    const dx = x - (w - 1) / 2, dy = y - (h - 1) / 2;
    const d = Math.hypot(dx, dy), r = w / 2 - 1;
    if (Math.abs(d - r) < 1) return YELLOW;
    if (d > r) return BLACK;
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    if (Math.abs(x - cx) < m / 2 && y >= 4 && y < 4 + m) return RED;
    if (Math.abs(y - cy) < m / 2 && x >= w - 4 - m && x < w - 4) return GREEN;
    if (Math.abs(y - cy) < m / 2 && x >= 4 && x < 4 + m) return BLUE;
  } else {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return WHITE;
    if (x < 1 + m && y < 1 + m) return RED;
    if (x >= w - 1 - m && y < 1 + m) return GREEN;
    if (x < 1 + m && y >= h - 1 - m) return BLUE;
  }
  if (mono) {
    if (y >= h / 2 && x >= w / 2 && x < w - 4 && y < h - 4) return ((Math.floor(x / 4) + Math.floor(y / 4)) & 1) ? WHITE : BLACK;
    return BLACK;
  }
  const barTop = Math.floor((h * 30) / 100), barBottom = Math.floor((h * 62) / 100);
  const rampTop = Math.floor((h * 66) / 100), rampBottom = Math.floor((h * 76) / 100);
  const inset = round ? Math.floor(w / 8) : 2;
  if (x < inset || x >= w - inset) return BLACK;
  const span = w - 2 * inset;
  if (y >= barTop && y < barBottom) return BARS[Math.floor(((x - inset) * 8) / span)];
  if (y >= rampTop && y < rampBottom) {
    const v = Math.floor(((x - inset) * 255) / (span - 1));
    return ((v & 0xf8) << 8) | ((v & 0xfc) << 3) | (v >> 3);
  }
  return BLACK;
}

// Mono panels show "on" pixels; anything non-black is lit.
export function testPatternImage(w: number, h: number, round: boolean, mono: boolean): ImageData {
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = testPatternPixel(x, y, w, h, round, mono);
      const [r, g, b] = mono ? (c ? [235, 240, 255] : [6, 8, 12]) : from565(c);
      img.data.set([r, g, b, round && Math.hypot(x - (w - 1) / 2, y - (h - 1) / 2) > w / 2 ? 0 : 255], (y * w + x) * 4);
    }
  return img;
}
