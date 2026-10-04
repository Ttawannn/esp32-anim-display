// Clock layers drawn for the editor canvas: a transparent, screen-sized overlay using the same
// glyphs and layout as the board. Cached per widget block and displayed time.

import { from565 } from '../color/rgb565';
import type { Project } from '../model/types';
import { clockTimeOf, type ClockTime } from './clock';
import { widgetsFor, type ProjectWidgets } from './raster';
import { drawWidgets, layoutWidget } from './widgets';

let cache: { w: ProjectWidgets; key: string; canvas: OffscreenCanvas } | null = null;

export function clockOverlay(p: Project, screenW: number, screenH: number, time: ClockTime = clockTimeOf(new Date())): OffscreenCanvas | null {
  let w: ProjectWidgets | null;
  try { w = widgetsFor(p); } catch { return null; }
  if (!w) return null;
  const key = JSON.stringify([screenW, screenH, p.offsetX, p.offsetY, p.width, p.height, p.scale,
    w.parsed.widgets.map((x) => layoutWidget(w!.parsed, x, time).items)]);
  if (cache && cache.w === w && cache.key === key) return cache.canvas;
  const img = new ImageData(screenW, screenH);
  const clip = { x: p.offsetX, y: p.offsetY, w: p.width * p.scale, h: p.height * p.scale };
  drawWidgets(w.parsed, time, { clip, dx: 0, dy: 0, pixel: (x, y, a, c) => {
    if (x < 0 || y < 0 || x >= screenW || y >= screenH) return;
    const [r, g, b] = from565(c);
    img.data.set([r, g, b, a * 17], (y * screenW + x) * 4);
  } });
  const canvas = new OffscreenCanvas(screenW, screenH);
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  cache = { w, key, canvas };
  return canvas;
}
