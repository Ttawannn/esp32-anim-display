import type { Pixels } from '../model/types';

export type FitMode = 'contain' | 'cover' | 'stretch';

export interface Placement {
  fit: FitMode;
  zoom: number; // 1 = fit as computed, >1 zooms in
  panX: number; // -1..1, fraction of the overflow
  panY: number;
  smooth: boolean; // false = nearest neighbour (pixel art)
}

export const DEFAULT_PLACEMENT: Placement = { fit: 'contain', zoom: 1, panX: 0, panY: 0, smooth: true };

// Draws `src` (sw x sh) into a dw x dh RGBA buffer. Uncovered areas stay transparent.
export function placeImage(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  pl: Placement,
  ctx?: OffscreenCanvasRenderingContext2D,
): Pixels {
  const c = ctx ?? new OffscreenCanvas(dw, dh).getContext('2d', { willReadFrequently: true })!;
  c.clearRect(0, 0, dw, dh);
  c.imageSmoothingEnabled = pl.smooth;
  c.imageSmoothingQuality = 'high';
  let w: number, h: number;
  if (pl.fit === 'stretch') {
    w = dw * pl.zoom;
    h = dh * pl.zoom;
  } else {
    const s = (pl.fit === 'contain' ? Math.min(dw / sw, dh / sh) : Math.max(dw / sw, dh / sh)) * pl.zoom;
    w = sw * s;
    h = sh * s;
  }
  const x = (dw - w) / 2 + (pl.panX * Math.abs(dw - w)) / 2;
  const y = (dh - h) / 2 + (pl.panY * Math.abs(dh - h)) / 2;
  c.drawImage(src, 0, 0, sw, sh, x, y, w, h);
  return c.getImageData(0, 0, dw, dh).data;
}

export function rgbaToCanvas(data: Pixels, w: number, h: number): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  return c;
}
