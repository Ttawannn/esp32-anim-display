import { from565 } from './rgb565';

export interface Quantized {
  palette: Uint16Array; // RGB565 colors
  map: Uint8Array; // 565 color -> palette index (valid only for colors present in the input)
  exact: boolean; // true when no colors were merged
}

export function countColors(frames: Uint16Array[]): Uint32Array {
  const hist = new Uint32Array(65536);
  for (const f of frames) for (let i = 0; i < f.length; i++) hist[f[i]]++;
  return hist;
}

// Reduce to at most `maxColors` (median cut, weighted by pixel count). Exact when it already fits.
export function quantize(frames: Uint16Array[], maxColors = 256): Quantized {
  const hist = countColors(frames);
  const present: number[] = [];
  for (let c = 0; c < 65536; c++) if (hist[c]) present.push(c);

  const map = new Uint8Array(65536);
  if (present.length <= maxColors) {
    present.forEach((c, i) => (map[c] = i));
    return { palette: Uint16Array.from(present), map, exact: true };
  }

  type Box = { colors: number[] };
  const boxes: Box[] = [{ colors: present }];
  while (boxes.length < maxColors) {
    // Split the box with the widest channel range (ties: most pixels).
    let best = -1, bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length < 2) continue;
      const s = boxScore(boxes[i].colors, hist);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best < 0) break;
    const [a, b] = splitBox(boxes[best].colors, hist);
    boxes.splice(best, 1, { colors: a }, { colors: b });
  }

  const palette = new Uint16Array(boxes.length);
  const prgb: [number, number, number][] = [];
  boxes.forEach((box, i) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of box.colors) {
      const [cr, cg, cb] = from565(c);
      const w = hist[c];
      r += cr * w; g += cg * w; b += cb * w; n += w;
    }
    const rr = Math.round(r / n), gg = Math.round(g / n), bb = Math.round(b / n);
    palette[i] = ((rr & 0xf8) << 8) | ((gg & 0xfc) << 3) | (bb >> 3);
    prgb.push(from565(palette[i]));
  });
  // Map every present color to its nearest palette entry (not just its box: better edges).
  for (const c of present) {
    const [r, g, b] = from565(c);
    let bi = 0, bd = Infinity;
    for (let i = 0; i < prgb.length; i++) {
      const dr = r - prgb[i][0], dg = g - prgb[i][1], db = b - prgb[i][2];
      const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
      if (d < bd) { bd = d; bi = i; }
    }
    map[c] = bi;
  }
  return { palette, map, exact: false };
}

function channelRanges(colors: number[]) {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const c of colors) {
    const [r, g, b] = from565(c);
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }
  return [rMax - rMin, gMax - gMin, bMax - bMin];
}

function boxScore(colors: number[], hist: Uint32Array): number {
  const [r, g, b] = channelRanges(colors);
  let n = 0;
  for (const c of colors) n += hist[c];
  return Math.max(r, g, b) * Math.log2(n + 1);
}

function splitBox(colors: number[], hist: Uint32Array): [number[], number[]] {
  const ranges = channelRanges(colors);
  const ch = ranges.indexOf(Math.max(...ranges));
  const sorted = colors.slice().sort((a, b) => from565(a)[ch] - from565(b)[ch]);
  let total = 0;
  for (const c of sorted) total += hist[c];
  let acc = 0, cut = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    acc += hist[sorted[i]];
    if (acc >= total / 2) { cut = i + 1; break; }
  }
  return [sorted.slice(0, cut), sorted.slice(cut)];
}

// Apply a quantization to frames, returning palette indices.
export function toIndices(frame: Uint16Array, q: Quantized): Uint8Array {
  const out = new Uint8Array(frame.length);
  for (let i = 0; i < frame.length; i++) out[i] = q.map[frame[i]];
  return out;
}
