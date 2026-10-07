// Ready-made animations generated for the chosen display. Each template draws its frames from
// code (no image files), so it fits any panel size and colour depth. Loops are seamless where the
// motion allows: positions are periodic in t = frame / frameCount.

import { EMOJI_FONT, fontCss } from '../layers/catalog';
import { widgetsFor } from '../layers/raster';
import { getPreset, type DisplayPreset } from '../model/presets';
import { createProject, newFrame } from '../model/project';
import type { ClockLayer, Layer, Pixels, Project } from '../model/types';
import { defaultEyeOptions } from './eyeProject';
import { EYE_ANIMS, generateEyes, type EyeAnim, type EyeOptions } from './eyes';
import { hsv, Img, mix, rgb, rng, safeRadius, type RGB } from './kit';

export interface TemplateCtx {
  w: number; // canvas size
  h: number;
  scale: number;
  mono: boolean;
  round: boolean;
  screenW: number;
  screenH: number;
}

export type OptionDef =
  | { id: string; label: string; type: 'color' }
  | { id: string; label: string; type: 'choice'; choices: [string, string][] }
  | { id: string; label: string; type: 'text' };

export type Options = Record<string, string>;

export interface Generated {
  frames: { data: Pixels; delay: number }[];
  layers?: Layer[];
  background?: string;
  canvas?: { w: number; h: number; scale: number }; // when the generator picks its own canvas (eyes)
  // Places clock layers once their rendered sizes are known (screen pixels, same order as
  // `layers`). Without it they are centred horizontally and keep their y.
  arrange?: (boxes: { w: number; h: number }[]) => { x: number; y: number }[];
}

export type CategoryId = 'eyes' | 'nature' | 'fun' | 'tech' | 'text';

export interface AnimTemplate {
  id: string;
  name: string;
  icon: string; // UI icon name (ui/common.tsx)
  hint: string;
  category: CategoryId;
  pixel: number; // pixel size on a 240-px screen (1 = full resolution, 4 = chunky pixel art)
  canvas?: boolean; // renders text/emoji with OffscreenCanvas
  smoothMono?: boolean; // keep dithering on 1-bit panels (gradients); otherwise hard threshold
  options: OptionDef[];
  defaults: Options;
  generate(c: TemplateCtx, o: Options): Generated;
}

export const CATEGORIES: { id: CategoryId | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'text', label: 'Text & clock' },
  { id: 'nature', label: 'Nature' },
  { id: 'fun', label: 'Fun' },
  { id: 'tech', label: 'Tech' },
];

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

// Colour option, forced to white on 1-bit panels.
const col = (c: TemplateCtx, o: Options, key: string): RGB => (c.mono ? WHITE : rgb(o[key]));
const bgCol = (c: TemplateCtx, o: Options, key = 'bg'): RGB => (c.mono ? BLACK : rgb(o[key] ?? '#000000'));
const smooth = (c: TemplateCtx) => c.scale <= 2;
// Screen shapes that get their own layout: a portrait screen (0.96" upright, or any panel turned
// a quarter) and a long strip (0.91" OLED).
const isTall = (c: TemplateCtx) => c.screenH > c.screenW * 1.3;
const isStrip = (c: TemplateCtx) => c.screenW > c.screenH * 3;

function frames(n: number, delay: number | ((i: number) => number), draw: (t: number, i: number) => Img) {
  return Array.from({ length: n }, (_, i) => ({ data: draw(i / n, i).d, delay: typeof delay === 'number' ? delay : delay(i) }));
}

// Gradient lookup through colour stops at 0..1.
function ramp(stops: RGB[]): (v: number) => RGB {
  return (v) => {
    const x = Math.max(0, Math.min(1, v)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    return mix(stops[i], stops[i + 1], x - i);
  };
}

const PALETTES: Record<string, RGB[]> = {
  fire: [[0, 0, 0], [90, 8, 0], [200, 40, 0], [255, 120, 0], [255, 210, 60], [255, 255, 220]],
  blue: [[0, 0, 0], [0, 10, 80], [0, 70, 200], [40, 170, 255], [180, 240, 255], [255, 255, 255]],
  green: [[0, 0, 0], [0, 50, 10], [0, 140, 40], [60, 230, 80], [200, 255, 160], [255, 255, 255]],
  purple: [[0, 0, 0], [40, 0, 70], [120, 20, 180], [210, 80, 255], [255, 190, 255], [255, 255, 255]],
  rainbow: [[255, 0, 80], [255, 140, 0], [255, 230, 0], [0, 220, 100], [0, 160, 255], [140, 60, 255], [255, 0, 80]],
  ocean: [[0, 20, 60], [0, 90, 160], [0, 190, 210], [120, 240, 230], [0, 90, 160], [0, 20, 60]],
  sunset: [[40, 0, 60], [180, 30, 90], [255, 100, 60], [255, 200, 80], [180, 30, 90], [40, 0, 60]],
};

const PALETTE_CHOICES: [string, string][] = [['fire', 'Fire'], ['blue', 'Blue'], ['green', 'Green'], ['purple', 'Purple']];

// ---------------------------------------------------------------------------------------------

const heart: AnimTemplate = {
  id: 'heart', name: 'Beating heart', icon: 'heart', hint: 'A double heartbeat', category: 'fun', pixel: 4,
  options: [{ id: 'color', label: 'Heart color', type: 'color' }, { id: 'bg', label: 'Background', type: 'color' }],
  defaults: { color: '#ff2d55', bg: '#000000' },
  generate(c, o) {
    const fg = col(c, o, 'color'), bg = bgCol(c, o), shine = mix(fg, WHITE, 0.55);
    const R0 = safeRadius(c.w, c.h, c.round) * 0.62;
    const beat = (t: number) => Math.exp(-(((t - 0.1) / 0.06) ** 2)) + 0.7 * Math.exp(-(((t - 0.32) / 0.06) ** 2));
    return { frames: frames(20, 50, (t) => {
      const img = new Img(c.w, c.h, bg);
      const R = R0 * (1 + 0.16 * beat(t)), cx = c.w / 2, cy = c.h / 2;
      img.shape((x, y) => {
        const u = (x - cx) / R, v = -(y - cy) / R + 0.15;
        const q = u * u + v * v - 1;
        return q * q * q - u * u * v * v * v <= 0;
      }, fg);
      if (!c.mono) img.disc(cx - R * 0.48, cy - R * 0.42, Math.max(1, R * 0.16), shine, smooth(c), 0.8);
      return img;
    }) };
  },
};

const spinner: AnimTemplate = {
  id: 'spinner', name: 'Loading', icon: 'loader', hint: 'Spinning dots', category: 'tech', pixel: 2,
  options: [{ id: 'color', label: 'Color', type: 'color' }, { id: 'style', label: 'Style', type: 'choice', choices: [['dots', 'Dots'], ['ring', 'Ring']] }],
  defaults: { color: '#4f8cff', style: 'dots' },
  generate(c, o) {
    const fg = col(c, o, 'color'), cx = c.w / 2, cy = c.h / 2, R = safeRadius(c.w, c.h, c.round) * 0.6;
    const n = 12;
    return { frames: frames(24, 40, (t) => {
      const img = new Img(c.w, c.h, BLACK);
      if (o.style === 'ring') {
        const width = Math.max(2, R * 0.22);
        img.ring(cx, cy, R, width, mix(fg, BLACK, 0.8), smooth(c));
        const head = t * Math.PI * 2;
        for (let k = 0; k < 40; k++) {
          const a = head - (k / 40) * Math.PI * 1.4;
          img.disc(cx + R * Math.cos(a), cy + R * Math.sin(a), width / 2, mix(BLACK, fg, 1 - k / 40), smooth(c));
        }
      } else {
        const head = Math.floor(t * n * 2) % n;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 - Math.PI / 2;
          const age = (head - k + n) % n;
          const f = Math.max(0.15, 1 - age / (n * 0.6));
          // 1-bit panels can't fade a dot, so the trail shrinks instead.
          if (c.mono) img.disc(cx + R * Math.cos(a), cy + R * Math.sin(a), Math.max(1, R * 0.15 * (0.3 + 0.7 * f)), WHITE, false);
          else img.disc(cx + R * Math.cos(a), cy + R * Math.sin(a), Math.max(1, R * 0.13 * (0.6 + 0.4 * f)), mix(BLACK, fg, f), smooth(c));
        }
      }
      return img;
    }) };
  },
};

const fire: AnimTemplate = {
  id: 'fire', name: 'Fire', icon: 'flame', hint: 'Retro-game flames', category: 'nature', pixel: 3, smoothMono: true,
  options: [{ id: 'palette', label: 'Flame color', type: 'choice', choices: PALETTE_CHOICES }],
  defaults: { palette: 'fire' },
  generate(c, o) {
    const pal = ramp(PALETTES[o.palette] ?? PALETTES.fire);
    const w = c.w, h = c.h, max = 36;
    // Flames cool by `decay` per row on average, so they reach about 70% of the screen height
    // whatever its shape (tall portrait or a flat strip).
    const decay = max / (h * 0.7);
    const grid = new Float32Array(w * h);
    const rand = rng(7);
    grid.fill(max, (h - 1) * w);
    const step = () => {
      for (let x = 0; x < w; x++)
        for (let y = 1; y < h; y++) {
          const src = y * w + x, r = Math.floor(rand() * 3);
          const dst = src - w - r + 1;
          const v = grid[src] - rand() * 2 * decay;
          if (dst >= 0 && dst < w * h) grid[dst] = Math.max(0, v);
        }
    };
    for (let i = 0; i < h * 2; i++) step();
    return { frames: frames(40, 50, () => {
      step();
      const img = new Img(w, h, BLACK);
      for (let i = 0; i < w * h; i++) {
        const v = grid[i] / max;
        if (v > 0.02) img.plot(i % w, (i / w) | 0, pal(v));
      }
      return img;
    }) };
  },
};

const rain: AnimTemplate = {
  id: 'rain', name: 'Rain', icon: 'cloudRain', hint: 'Endless falling rain', category: 'nature', pixel: 2,
  options: [{ id: 'color', label: 'Rain color', type: 'color' }, { id: 'bg', label: 'Sky', type: 'color' }],
  defaults: { color: '#7cc4ff', bg: '#0a1022' },
  generate(c, o) {
    const fg = col(c, o, 'color'), bg = bgCol(c, o), rand = rng(3);
    const drops = Array.from({ length: Math.max(6, Math.round((c.w * c.h) / 70)) }, () => ({
      x: Math.floor(rand() * c.w), y: rand(), len: 2 + Math.floor(rand() * Math.max(2, c.h / 14)), k: rand() < 0.4 ? 2 : 1,
    }));
    return { frames: frames(24, 45, (t) => {
      const img = new Img(c.w, c.h, bg);
      for (const d of drops) {
        const span = c.h + d.len;
        const top = ((d.y + t * d.k) % 1) * span - d.len;
        for (let k = 0; k < d.len; k++) img.plot(d.x, top + k, fg, c.mono ? 1 : 0.35 + (0.65 * k) / d.len);
      }
      return img;
    }) };
  },
};

const snow: AnimTemplate = {
  id: 'snow', name: 'Snow', icon: 'snowflake', hint: 'Drifting snowflakes', category: 'nature', pixel: 2,
  options: [{ id: 'bg', label: 'Sky', type: 'color' }],
  defaults: { bg: '#0b1534' },
  generate(c, o) {
    const bg = bgCol(c, o), rand = rng(11);
    const flakes = Array.from({ length: Math.max(8, Math.round((c.w * c.h) / 90)) }, () => ({
      x: rand() * c.w, y: rand(), r: rand() < 0.3 ? 1.4 : 0.7, sway: 1 + rand() * 3, ph: rand(), m: rand() < 0.5 ? 1 : 2,
    }));
    return { frames: frames(32, 60, (t) => {
      const img = new Img(c.w, c.h, bg);
      for (const f of flakes) {
        const y = ((f.y + t) % 1) * (c.h + 4) - 2;
        const x = f.x + Math.sin(2 * Math.PI * (t * f.m + f.ph)) * f.sway;
        img.disc(x, y, f.r, WHITE, smooth(c), f.r > 1 || c.mono ? 1 : 0.8);
      }
      return img;
    }) };
  },
};

function starField(c: TemplateCtx, seed: number, density: number) {
  const rand = rng(seed);
  return Array.from({ length: Math.max(6, Math.round((c.w * c.h) / density)) }, () => ({
    x: Math.floor(rand() * c.w), y: Math.floor(rand() * c.h), k: 1 + Math.floor(rand() * 2), ph: rand(),
    tint: mix(WHITE, hsv(rand(), 0.6, 1), rand() * 0.5), big: rand() < 0.12,
  }));
}

function drawStars(img: Img, c: TemplateCtx, stars: ReturnType<typeof starField>, t: number, dim = 1) {
  for (const s of stars) {
    const b = (0.55 + 0.45 * Math.sin(2 * Math.PI * (t * s.k + s.ph))) * dim;
    if (c.mono && b < 0.6) continue;
    img.plot(s.x, s.y, s.tint, c.mono ? 1 : b);
    if (s.big && b > 0.75) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) img.plot(s.x + dx, s.y + dy, s.tint, c.mono ? 1 : (b - 0.6) * 1.5);
  }
}

const stars: AnimTemplate = {
  id: 'stars', name: 'Twinkling stars', icon: 'stars', hint: 'Twinkling stars and a shooting star', category: 'nature', pixel: 2,
  options: [{ id: 'bg', label: 'Sky', type: 'color' }],
  defaults: { bg: '#050818' },
  generate(c, o) {
    const bg = bgCol(c, o), field = starField(c, 5, 28);
    return { frames: frames(40, 70, (t) => {
      const img = new Img(c.w, c.h, bg);
      drawStars(img, c, field, t);
      // A shooting star crosses during the first third of the loop.
      if (t < 0.3) {
        const u = t / 0.3, x = c.w * (0.15 + 0.7 * u), y = c.h * (0.15 + 0.35 * u);
        for (let k = 0; k < 8; k++) img.plot(x - k * 1.6, y - k * 0.8, WHITE, c.mono ? (k < 4 ? 1 : 0) : 1 - k / 8);
      }
      return img;
    }) };
  },
};

const warp: AnimTemplate = {
  id: 'warp', name: 'Warp speed', icon: 'rocket', hint: 'Flying through the stars', category: 'tech', pixel: 2,
  options: [{ id: 'color', label: 'Star color', type: 'color' }],
  defaults: { color: '#cfe3ff' },
  generate(c, o) {
    const fg = col(c, o, 'color'), rand = rng(9), cx = c.w / 2, cy = c.h / 2, maxR = Math.hypot(c.w, c.h) / 2;
    const pts = Array.from({ length: Math.max(30, Math.round((c.w * c.h) / 120)) }, () => ({ a: rand() * Math.PI * 2, z: rand(), k: rand() < 0.3 ? 2 : 1 }));
    const radius = (z: number) => maxR * Math.pow(1 - z, 2.2) * 1.1;
    return { frames: frames(24, 40, (t) => {
      const img = new Img(c.w, c.h, BLACK);
      for (const p of pts) {
        const z = (((p.z - t * p.k * 0.5) % 1) + 1) % 1, z2 = Math.min(1, z + 0.06);
        const r1 = radius(z), r0 = radius(z2), b = Math.min(1, (1 - z) * 1.4);
        img.line(cx + r0 * Math.cos(p.a), cy + r0 * Math.sin(p.a), cx + r1 * Math.cos(p.a), cy + r1 * Math.sin(p.a), fg, 1, c.mono ? (b > 0.3 ? 1 : 0) : b);
      }
      return img;
    }) };
  },
};

// 3×5 random glyphs for the matrix rain.
const glyphBits = (seed: number) => {
  const r = rng(seed);
  return Array.from({ length: 15 }, () => r() < 0.55);
};

const matrix: AnimTemplate = {
  id: 'matrix', name: 'Matrix', icon: 'code', hint: 'Green falling code', category: 'tech', pixel: 2,
  options: [{ id: 'color', label: 'Color', type: 'color' }],
  defaults: { color: '#33ff77' },
  generate(c, o) {
    const fg = col(c, o, 'color'), head = mix(fg, WHITE, 0.7), rand = rng(21);
    const cols = Math.floor(c.w / 4), rows = Math.ceil(c.h / 6), trail = Math.max(5, Math.round(rows * 0.6));
    const streams = Array.from({ length: cols }, () => ({ p: rand(), k: rand() < 0.35 ? 2 : 1, seed: Math.floor(rand() * 1e6) }));
    return { frames: frames(30, 70, (t, i) => {
      const img = new Img(c.w, c.h, BLACK);
      streams.forEach((s, x) => {
        const span = rows + trail;
        const pos = Math.floor(((s.p + t * s.k) % 1) * span);
        for (let k = 0; k < trail; k++) {
          const row = pos - k;
          if (row < 0 || row >= rows) continue;
          const bits = glyphBits(s.seed + row * 31 + (k === 0 ? i : Math.floor(i / 6)));
          const color = k === 0 ? head : fg, a = c.mono ? (k < trail * 0.6 ? 1 : 0) : 1 - k / trail;
          bits.forEach((on, b) => on && img.plot(x * 4 + (b % 3), row * 6 + Math.floor(b / 3), color, a));
        }
      });
      return img;
    }) };
  },
};

const equalizer: AnimTemplate = {
  id: 'equalizer', name: 'Equalizer', icon: 'equalizer', hint: 'Bouncing audio bars', category: 'tech', pixel: 2,
  options: [
    { id: 'bars', label: 'Bars', type: 'choice', choices: [['8', '8'], ['12', '12'], ['16', '16']] },
    { id: 'colors', label: 'Color', type: 'choice', choices: [['classic', 'Green-yellow-red'], ['neon', 'Neon'], ['one', 'Single color']] },
    { id: 'color', label: 'Single color', type: 'color' },
  ],
  defaults: { bars: '12', colors: 'classic', color: '#00e0ff' },
  generate(c, o) {
    const n = Number(o.bars), gap = Math.max(1, Math.round(c.w / n / 5));
    const bw = (c.w - gap * (n + 1)) / n, seg = Math.max(2, Math.round(c.h / 24)), rand = rng(4);
    const waves = Array.from({ length: n }, () => [rand(), rand(), 1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 2)]);
    const colorAt = (v: number, x: number): RGB => c.mono ? WHITE
      : o.colors === 'one' ? rgb(o.color)
      : o.colors === 'neon' ? hsv(0.55 + x * 0.35, 0.9, 1)
      : v < 0.55 ? [40, 220, 90] : v < 0.8 ? [255, 210, 40] : [255, 60, 60];
    return { frames: frames(24, 60, (t) => {
      const img = new Img(c.w, c.h, BLACK);
      waves.forEach(([p1, p2, k1, k2], i) => {
        const v = 0.12 + 0.88 * Math.abs(0.6 * Math.sin(2 * Math.PI * (t * k1 + p1)) + 0.4 * Math.sin(2 * Math.PI * (t * k2 + p2)));
        const top = c.h - v * c.h * 0.92;
        const x = gap + i * (bw + gap);
        for (let y = c.h - seg; y >= top - seg; y -= seg) {
          img.rect(x, y + 1, bw, seg - 1, colorAt(1 - y / c.h, i / n));
        }
      });
      return img;
    }) };
  },
};

const plasma: AnimTemplate = {
  id: 'plasma', name: 'Rainbow plasma', icon: 'rainbow', hint: 'Flowing color waves', category: 'fun', pixel: 4,
  options: [{ id: 'palette', label: 'Palette', type: 'choice', choices: [['rainbow', 'Rainbow'], ['ocean', 'Ocean'], ['sunset', 'Sunset'], ['purple', 'Purple']] }],
  defaults: { palette: 'rainbow' },
  generate(c, o) {
    const pal = ramp(PALETTES[o.palette] ?? PALETTES.rainbow);
    const s = 12 / Math.max(c.w, c.h);
    return { frames: frames(32, 50, (t) => {
      const img = new Img(c.w, c.h);
      const a = 2 * Math.PI * t;
      for (let y = 0; y < c.h; y++)
        for (let x = 0; x < c.w; x++) {
          const u = x * s, v = y * s;
          const val = Math.sin(u + a) + Math.sin(v * 0.8 - a) + Math.sin((u + v) * 0.6 + a) + Math.sin(Math.hypot(u - 6, v - 6) - 2 * a);
          const k = (val / 4 + 0.5 + t) % 1;
          // 1-bit panels: flowing contour bands (dithered gradients turn into noise there).
          img.plot(x, y, c.mono ? ((k * 3) % 1 < 0.5 ? WHITE : BLACK) : pal(k));
        }
      return img;
    }) };
  },
};

const bounce: AnimTemplate = {
  id: 'bounce', name: 'Bouncing ball', icon: 'ball', hint: 'Bounces with a shadow', category: 'fun', pixel: 2,
  options: [{ id: 'color', label: 'Ball color', type: 'color' }, { id: 'bg', label: 'Background', type: 'color' }],
  defaults: { color: '#ff5a36', bg: '#101a30' },
  generate(c, o) {
    const fg = col(c, o, 'color'), bg = bgCol(c, o), hi = mix(fg, WHITE, 0.6), dark = mix(fg, BLACK, 0.45);
    const r = Math.max(3, Math.min(c.w * 0.15, c.h * 0.14)), floor = c.h * (c.round ? 0.8 : 0.88);
    return { frames: frames(36, 35, (t) => {
      const img = new Img(c.w, c.h, bg);
      const hop = Math.abs(Math.sin(2 * Math.PI * t * 2)); // two bounces per loop
      const x = c.w / 2 + Math.sin(2 * Math.PI * t) * (c.w / 2 - r * (c.round ? 2.4 : 1.4));
      const y = floor - r - hop * (floor - r * 2 - c.h * 0.08);
      const squash = hop < 0.12 ? 1 - (0.12 - hop) * 2.2 : 1;
      if (!c.mono) img.shape((px, py) => ((px - x) / (r * (1.4 - hop * 0.6))) ** 2 + ((py - floor) / (r * 0.25)) ** 2 <= 1, mix(bg, BLACK, 0.5));
      const ry = r * squash, rx = r / squash, by = squash < 1 ? floor - ry : y;
      img.shape((px, py) => ((px - x) / rx) ** 2 + ((py - by) / ry) ** 2 <= 1, c.mono ? WHITE : dark);
      if (!c.mono) img.shape((px, py) => ((px - x + rx * 0.12) / (rx * 0.85)) ** 2 + ((py - by + ry * 0.12) / (ry * 0.85)) ** 2 <= 1, fg);
      if (!c.mono) img.disc(x - rx * 0.35, by - ry * 0.35, Math.max(1, r * 0.22), hi, smooth(c));
      return img;
    }) };
  },
};

const pacman: AnimTemplate = {
  id: 'pacman', name: 'Pac-Man', icon: 'pacman', hint: 'Eats dots, chased by a ghost', category: 'fun', pixel: 4,
  options: [{ id: 'ghost', label: 'Ghost', type: 'choice', choices: [['yes', 'Yes'], ['no', 'No']] }],
  defaults: { ghost: 'yes' },
  generate(c, o) {
    // Runs along the long side: left to right, or top to bottom on a portrait screen.
    const down = isTall(c);
    const long = down ? c.h : c.w, across = down ? c.w : c.h;
    const r = Math.max(3, Math.min(across * 0.22, long * 0.14)), mid = across / 2;
    const xy = (along: number): [number, number] => (down ? [mid, along] : [along, mid]);
    const yellow: RGB = c.mono ? WHITE : [255, 220, 0], ghostCol: RGB = c.mono ? WHITE : [255, 60, 70], dot: RGB = c.mono ? WHITE : [255, 200, 170];
    const travel = long + r * (o.ghost === 'yes' ? 7 : 3);
    const spacing = Math.max(4, Math.round(r * 1.2));
    return { frames: frames(40, 50, (t) => {
      const img = new Img(c.w, c.h, BLACK);
      const pos = -r * 1.5 + t * travel;
      for (let d = spacing / 2; d < long; d += spacing) {
        if (d <= pos + r * 0.2) continue;
        const [dx, dy] = xy(d);
        img.rect(dx - 1, dy - 1, 2, 2, dot);
      }
      const mouth = 0.08 + 0.32 * Math.abs(Math.sin(2 * Math.PI * t * 8));
      const [px0, py0] = xy(pos);
      img.shape((px, py) => {
        const dx = px - px0, dy = py - py0;
        if (dx * dx + dy * dy > r * r) return false;
        const [ahead, side] = down ? [dy, dx] : [dx, dy];
        return Math.abs(Math.atan2(side, ahead)) > mouth * Math.PI;
      }, yellow);
      if (o.ghost === 'yes') {
        // The ghost follows behind and always stands upright.
        const [gx, gy] = xy(pos - r * 3.2), wave = Math.floor(t * 16) % 2;
        img.shape((px, py) => {
          const dx = px - gx;
          if (Math.abs(dx) > r) return false;
          if (py < gy) return dx * dx + (py - gy) ** 2 <= r * r;
          const skirt = gy + r - ((Math.floor((dx + r) / (r / 2)) + wave) % 2 ? r * 0.3 : 0);
          return py <= skirt;
        }, ghostCol, gx - r, gy - r, gx + r + 1, gy + r + 1);
        if (!c.mono) for (const ex of [-0.4, 0.4]) {
          img.disc(gx + ex * r, gy - r * 0.15, Math.max(1, r * 0.28), WHITE);
          img.disc(gx + ex * r + (down ? 0 : r * 0.1), gy - r * (down ? 0.03 : 0.1), Math.max(0.6, r * 0.13), [30, 60, 220]);
        }
      }
      return img;
    }) };
  },
};

const battery: AnimTemplate = {
  id: 'battery', name: 'Charging battery', icon: 'battery', hint: 'Battery fills up', category: 'tech', pixel: 4,
  options: [],
  defaults: {},
  generate(c) {
    // Lies flat, or stands up (terminal on top, filling from the bottom) on a portrait screen.
    const up = isTall(c);
    const long = up ? c.h : c.w, across = up ? c.w : c.h;
    const bw = Math.min(long * 0.7, across * 1.3), bh = bw * 0.5, x0 = (long - bw) / 2, y0 = (across - bh) / 2;
    const line = Math.max(1, Math.round(bw / 18)), segs = 5;
    const levels = [0, 1, 2, 3, 4, 5, 5, 5];
    const colorFor = (n: number): RGB => c.mono ? WHITE : n <= 1 ? [255, 70, 60] : n <= 3 ? [255, 200, 40] : [60, 220, 90];
    return { frames: frames(levels.length, (i) => (i >= 5 ? 350 : 380), (_, i) => {
      const img = new Img(c.w, c.h, BLACK);
      // Draws in the flat battery's coordinates; standing up, "along" runs bottom to top.
      const rect = (a: number, b: number, la: number, lb: number, col: RGB) =>
        up ? img.rect(b, c.h - a - la, lb, la, col) : img.rect(a, b, la, lb, col);
      const n = levels[i], frameCol: RGB = c.mono ? WHITE : [200, 205, 215];
      rect(x0, y0, bw, line, frameCol); rect(x0, y0 + bh - line, bw, line, frameCol);
      rect(x0, y0, line, bh, frameCol); rect(x0 + bw - line, y0, line, bh, frameCol);
      rect(x0 + bw, y0 + bh * 0.3, line * 1.5, bh * 0.4, frameCol);
      const blink = i >= 5 && i % 2 === 1;
      const inner = bw - line * 4, sw = inner / segs;
      for (let k = 0; k < n; k++) if (!blink) rect(x0 + line * 2 + k * sw + 1, y0 + line * 2, sw - 2, bh - line * 4, colorFor(n));
      return img;
    }) };
  },
};

const wifi: AnimTemplate = {
  id: 'wifi', name: 'Wi-Fi signal', icon: 'wifi', hint: 'Signal bars one by one', category: 'tech', pixel: 2,
  options: [{ id: 'color', label: 'Color', type: 'color' }],
  defaults: { color: '#4fd1ff' },
  generate(c, o) {
    const fg = col(c, o, 'color'), cx = c.w / 2, R = safeRadius(c.w, c.h, c.round) * 0.9, cy = c.h / 2 + R * 0.45;
    const width = Math.max(2, R * 0.14);
    return { frames: frames(5, (i) => (i === 4 ? 900 : 320), (_, i) => {
      const img = new Img(c.w, c.h, BLACK);
      img.disc(cx, cy, Math.max(1.5, width * 0.75), fg, smooth(c));
      const shown = Math.min(i, 3);
      for (let k = 1; k <= 3; k++) {
        img.ring(cx, cy, (k * R) / 3.2, width, k <= shown ? fg : mix(BLACK, fg, c.mono ? 0 : 0.18), smooth(c), -Math.PI * 0.78, -Math.PI * 0.22);
      }
      return img;
    }) };
  },
};

const wave: AnimTemplate = {
  id: 'wave', name: 'Ocean waves', icon: 'waves', hint: 'Layered waves and a sun', category: 'nature', pixel: 3,
  options: [{ id: 'time', label: 'Time of day', type: 'choice', choices: [['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']] }],
  defaults: { time: 'sunset' },
  generate(c, o) {
    const sky = { day: [[110, 190, 255], [200, 235, 255]], sunset: [[60, 30, 110], [255, 140, 90]], night: [[5, 8, 30], [30, 40, 90]] }[o.time as 'day'] as RGB[];
    const sea = { day: [[0, 120, 200], [0, 90, 170], [0, 60, 130]], sunset: [[90, 60, 140], [60, 40, 110], [30, 20, 70]], night: [[20, 40, 90], [12, 28, 70], [5, 15, 45]] }[o.time as 'day'] as RGB[];
    const sunCol: RGB = o.time === 'night' ? [240, 240, 220] : o.time === 'sunset' ? [255, 200, 90] : [255, 240, 150];
    const skyAt = ramp(sky);
    return { frames: frames(32, 60, (t) => {
      const img = new Img(c.w, c.h);
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) img.plot(x, y, c.mono ? BLACK : skyAt(y / (c.h * 0.6)));
      img.disc(c.w * 0.68, c.h * 0.4, Math.min(c.w, c.h) * 0.14, c.mono ? WHITE : sunCol, smooth(c));
      sea.forEach((color, l) => {
        const base = c.h * (0.55 + l * 0.13), amp = c.h * (0.035 + l * 0.01), k = l + 1;
        for (let x = 0; x < c.w; x++) {
          const top = base + amp * Math.sin(2 * Math.PI * (x / (c.w * (0.6 - l * 0.12)) + t * k * (l % 2 ? -1 : 1)));
          for (let y = Math.floor(top); y < c.h; y++) img.plot(x, y, c.mono ? (l === 0 && y < top + 1 ? WHITE : BLACK) : color);
          if (!c.mono && l === 0) img.plot(x, Math.floor(top), mix(color, WHITE, 0.5));
        }
      });
      return img;
    }) };
  },
};

const fireworks: AnimTemplate = {
  id: 'fireworks', name: 'Fireworks', icon: 'fireworks', hint: 'Colorful bursts, one after another', category: 'fun', pixel: 2,
  options: [],
  defaults: {},
  generate(c) {
    const rand = rng(17);
    const bursts = Array.from({ length: 4 }, (_, i) => ({
      x: c.w * (0.25 + rand() * 0.5), y: c.h * (0.25 + rand() * 0.3), start: i / 4 + rand() * 0.08,
      color: hsv(rand(), 0.75, 1), parts: Array.from({ length: 28 }, (_, k) => ({ a: (k / 28) * Math.PI * 2 + rand() * 0.2, v: 0.6 + rand() * 0.4 })),
    }));
    const R = Math.min(c.w, c.h) * 0.32;
    return { frames: frames(48, 50, (t) => {
      const img = new Img(c.w, c.h, BLACK);
      for (const b of bursts) {
        const u = (((t - b.start) % 1) + 1) % 1;
        if (u > 0.85) { // rocket going up just before the burst
          const k = (u - 0.85) / 0.15;
          img.add(b.x, c.h - (c.h - b.y) * k, [255, 220, 160], 1);
          continue;
        }
        if (u > 0.45) continue;
        const life = u / 0.45, fade = 1 - life;
        for (const p of b.parts) {
          for (let s = 0; s < 3; s++) {
            const lt = Math.max(0, life - s * 0.03);
            const dist = R * p.v * (1 - (1 - lt) ** 2);
            const x = b.x + Math.cos(p.a) * dist, y = b.y + Math.sin(p.a) * dist + lt * lt * R * 0.35;
            img.add(x, y, c.mono ? WHITE : mix(b.color, WHITE, s ? 0 : 0.4), c.mono ? (fade > 0.3 && s === 0 ? 1 : 0) : fade * (1 - s * 0.3));
          }
        }
      }
      return img;
    }) };
  },
};

const life: AnimTemplate = {
  id: 'life', name: 'Game of Life', icon: 'cells', hint: 'Cells live and die by the rules', category: 'tech', pixel: 4,
  options: [{ id: 'color', label: 'Color', type: 'color' }],
  defaults: { color: '#7cff6b' },
  generate(c, o) {
    const fg = col(c, o, 'color'), w = c.w, h = c.h, rand = rng(23);
    let cells = Uint8Array.from({ length: w * h }, () => (rand() < 0.3 ? 1 : 0));
    const age = new Float32Array(w * h);
    return { frames: frames(60, 90, () => {
      const img = new Img(w, h, BLACK);
      for (let i = 0; i < w * h; i++) {
        if (cells[i]) age[i] = 1; else age[i] *= 0.5;
        if (age[i] > 0.1) img.plot(i % w, (i / w) | 0, fg, c.mono ? (cells[i] ? 1 : 0) : age[i]);
      }
      const next = new Uint8Array(w * h);
      let alive = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += cells[((y + dy + h) % h) * w + ((x + dx + w) % w)];
          const i = y * w + x;
          next[i] = n === 3 || (n === 2 && cells[i]) ? 1 : 0;
          alive += next[i];
        }
      if (alive < w * h * 0.04) for (let i = 0; i < w * h; i++) if (rand() < 0.15) next[i] = 1; // reseed a dying board
      cells = next;
      return img;
    }) };
  },
};

const radar: AnimTemplate = {
  id: 'radar', name: 'Radar', icon: 'radar', hint: 'Sweeping for targets', category: 'tech', pixel: 2,
  options: [{ id: 'color', label: 'Color', type: 'color' }],
  defaults: { color: '#3dff8a' },
  generate(c, o) {
    const fg = col(c, o, 'color'), dim = mix(BLACK, fg, 0.3), cx = c.w / 2, cy = c.h / 2, R = safeRadius(c.w, c.h, c.round) * 0.95;
    const rand = rng(13);
    const blips = Array.from({ length: 5 }, () => ({ a: rand() * Math.PI * 2, r: R * (0.25 + rand() * 0.65) }));
    return { frames: frames(36, 50, (t) => {
      const img = new Img(c.w, c.h, BLACK);
      const sweep = t * Math.PI * 2;
      // Fading trail behind the sweep line.
      for (let y = 0; y < c.h; y++)
        for (let x = 0; x < c.w; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
          if (d > R) continue;
          const behind = (((sweep - Math.atan2(dy, dx)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (behind < 1.2) img.plot(x, y, fg, c.mono ? (behind < 0.15 ? 1 : 0) : (1 - behind / 1.2) * 0.45);
        }
      for (const k of [1, 2, 3]) img.ring(cx, cy, (R * k) / 3, 1, c.mono ? WHITE : dim, smooth(c));
      img.line(cx - R, cy, cx + R, cy, c.mono ? WHITE : dim);
      img.line(cx, cy - R, cx, cy + R, c.mono ? WHITE : dim);
      img.line(cx, cy, cx + R * Math.cos(sweep), cy + R * Math.sin(sweep), fg, Math.max(1, R / 60));
      for (const b of blips) {
        const since = (((sweep - b.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const a = Math.max(0, 1 - since / (Math.PI * 1.5));
        if (a > 0.05) img.disc(cx + b.r * Math.cos(b.a), cy + b.r * Math.sin(b.a), Math.max(1.2, R * 0.04), mix(fg, WHITE, 0.4), smooth(c), c.mono ? 1 : a);
      }
      return img;
    }) };
  },
};

// ---------------------------------------------------------------------------------------------
// Canvas-based (text and emoji)

function ctx2d(w: number, h: number) {
  return new OffscreenCanvas(Math.max(1, w), Math.max(1, h)).getContext('2d', { willReadFrequently: true })!;
}

// Characters as the reader sees them (keeps Thai vowels and tone marks on their consonant).
const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((g) => g.segment);

// Word wrap for a measured font; words wider than a line (or text without spaces, like Thai)
// break between characters.
function wrapText(m: OffscreenCanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  const push = (word: string, sep: string) => {
    if (!line) line = word;
    else if (m.measureText(line + sep + word).width <= maxW) line += sep + word;
    else { lines.push(line); line = word; }
    while (m.measureText(line).width > maxW && graphemes(line).length > 1) {
      const chars = graphemes(line);
      let k = chars.length - 1;
      while (k > 1 && m.measureText(chars.slice(0, k).join('')).width > maxW) k--;
      lines.push(chars.slice(0, k).join(''));
      line = chars.slice(k).join('');
    }
  };
  text.split(/\s+/).filter(Boolean).forEach((w) => push(w, ' '));
  if (line) lines.push(line);
  return lines.length ? lines : [' '];
}

const marquee: AnimTemplate = {
  id: 'marquee', name: 'Scrolling text', icon: 'marquee', hint: 'A scrolling message sign', category: 'text', pixel: 2, canvas: true,
  options: [
    { id: 'text', label: 'Text', type: 'text' },
    { id: 'color', label: 'Text color', type: 'color' },
    { id: 'bg', label: 'Background', type: 'color' },
    { id: 'size', label: 'Size', type: 'choice', choices: [['0.5', 'Large'], ['0.35', 'Medium'], ['0.22', 'Small']] },
  ],
  defaults: { text: 'Hello there!', color: '#ffd23f', bg: '#000000', size: '0.5' },
  generate(c, o) {
    const fg = c.mono ? '#ffffff' : o.color, bg = bgCol(c, o);
    const msg = o.text || ' ';
    // Portrait screens are too narrow for a sideways ticker: the text wraps and rolls upward.
    const roll = isTall(c);
    const size = Math.max(7, Math.round((roll ? c.w * 0.62 : Math.min(c.h, c.w * 0.6)) * Number(o.size)));
    const font = `700 ${size}px ${fontCss('sans')}, ${EMOJI_FONT}`;
    const m = ctx2d(1, 1);
    m.font = font;
    const lines = roll ? wrapText(m, msg, c.w - 2) : [msg];
    const lineH = Math.round(size * 1.25);
    const sw = roll ? c.w : Math.ceil(m.measureText(msg).width) + 4, sh = roll ? lines.length * lineH : c.h;
    const strip = ctx2d(sw, sh);
    strip.font = font;
    strip.fillStyle = fg;
    strip.textBaseline = 'middle';
    strip.textAlign = roll ? 'center' : 'left';
    lines.forEach((line, i) => strip.fillText(line, roll ? c.w / 2 : 2, roll ? i * lineH + lineH / 2 + 1 : c.h / 2 + 1));
    const text = strip.getImageData(0, 0, sw, sh).data;
    const span = roll ? c.h : c.w, total = (roll ? sh : sw) + span, step = Math.max(1, Math.ceil(total / 300));
    const n = Math.ceil(total / step);
    return { frames: frames(n, 40, (_, i) => {
      const img = new Img(c.w, c.h, bg);
      const off = span - i * step;
      for (let y = 0; y < c.h; y++)
        for (let x = 0; x < c.w; x++) {
          const sx = roll ? x : x - off, sy = roll ? y - off : y;
          if (sx < 0 || sx >= sw || sy < 0 || sy >= sh) continue;
          const k = (sy * sw + sx) * 4, a = text[k + 3] / 255;
          if (a > 0) img.plot(x, y, [text[k], text[k + 1], text[k + 2]], c.mono ? (a > 0.5 ? 1 : 0) : a);
        }
      return img;
    }) };
  },
};

const emojiBounce: AnimTemplate = {
  id: 'emoji', name: 'Wiggly emoji', icon: 'emojiFace', hint: 'Bounce, wobble, spin or pulse', category: 'fun', pixel: 1, canvas: true,
  options: [
    { id: 'char', label: 'Emoji', type: 'text' },
    { id: 'motion', label: 'Motion', type: 'choice', choices: [['bounce', 'Bounce'], ['wobble', 'Wobble'], ['spin', 'Spin'], ['pulse', 'Pulse']] },
    { id: 'bg', label: 'Background', type: 'color' },
  ],
  defaults: { char: '😺', motion: 'bounce', bg: '#1b1f3a' },
  generate(c, o) {
    const bg = bgCol(c, o), size = Math.round(Math.min(c.w, c.h) * (c.round ? 0.5 : 0.58));
    const src = new OffscreenCanvas(size * 2, size * 2);
    const sctx = src.getContext('2d')!;
    sctx.font = `${size}px ${EMOJI_FONT}`;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText(o.char || '😺', size, size * 1.08);
    return { frames: frames(24, 50, (t) => {
      const ctx = ctx2d(c.w, c.h);
      const [r, g, b] = bg;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, c.w, c.h);
      ctx.translate(c.w / 2, c.h / 2);
      const s = Math.sin(2 * Math.PI * t);
      if (o.motion === 'bounce') {
        const hop = Math.abs(Math.sin(2 * Math.PI * t));
        ctx.translate(0, size * 0.25 - hop * size * 0.45);
        const sq = hop < 0.15 ? 1 + (0.15 - hop) : 1;
        ctx.scale(sq, 1 / sq);
      } else if (o.motion === 'wobble') ctx.rotate(s * 0.35);
      else if (o.motion === 'spin') ctx.rotate(2 * Math.PI * t);
      else ctx.scale(1 + 0.15 * Math.max(0, s), 1 + 0.15 * Math.max(0, s));
      ctx.drawImage(src, -size, -size);
      const img = new Img(c.w, c.h);
      img.d.set(ctx.getImageData(0, 0, c.w, c.h).data);
      return img;
    }) };
  },
};

function clockLayer(format: string, size: number, y: number, color: string): ClockLayer {
  return { kind: 'clock', id: Math.random().toString(36).slice(2, 10), x: 0, y: Math.round(y), size: Math.round(size), color, font: 'sans', bold: true, align: 'center', format };
}

const clock: AnimTemplate = {
  id: 'clock', name: 'Digital clock', icon: 'clock', hint: 'Live time on the board over an animated background', category: 'text', pixel: 2,
  options: [
    { id: 'bgStyle', label: 'Background', type: 'choice', choices: [['stars', 'Twinkling stars'], ['plasma', 'Flowing colors'], ['rain', 'Rain'], ['plain', 'Plain color']] },
    { id: 'show', label: 'Show', type: 'choice', choices: [['time-date', 'Time + date'], ['time', 'Time only'], ['seconds', 'Time + seconds']] },
    { id: 'names', label: 'Day and month names', type: 'choice', choices: [['en', 'English'], ['th', 'Thai']] },
    { id: 'color', label: 'Digit color', type: 'color' },
    { id: 'bg', label: 'Plain color', type: 'color' },
  ],
  defaults: { bgStyle: 'stars', show: 'time-date', names: 'en', color: '#ffffff', bg: '#060a1c' },
  generate(c, o) {
    let base: Generated;
    if (o.bgStyle === 'plasma') {
      base = plasma.generate(c, { palette: 'ocean' });
      for (const f of base.frames) for (let i = 0; i < f.data.length; i += 4) for (let k = 0; k < 3; k++) f.data[i + k] *= 0.45; // keep the digits readable
    } else if (o.bgStyle === 'rain') base = rain.generate(c, { color: '#3d6fa8', bg: o.bg });
    else if (o.bgStyle === 'plain') base = { frames: [{ data: new Img(c.w, c.h, bgCol(c, o)).d, delay: 1000 }] };
    else {
      const field = starField(c, 5, 34), bg = bgCol(c, o);
      base = { frames: frames(32, 90, (t) => { const img = new Img(c.w, c.h, bg); drawStars(img, c, field, t, 0.8); return img; }) };
    }
    const color = c.mono ? '#ffffff' : o.color;
    const H = c.screenH, W = c.screenW;
    const seconds = o.show === 'seconds', date = o.show === 'time-date';
    const latin = o.names === 'th' ? '' : 'L';
    const layers: Layer[] = [];
    const add = (format: string, size: number) => layers.push(clockLayer(format, size, 0, color));

    // Portrait: hours above minutes, as large as the width allows, then the date.
    if (isTall(c)) {
      const big = Math.min(W * 0.5, H * (date ? 0.24 : 0.3));
      add('HH', big);
      add('mm', big);
      if (seconds) add('ss', big * 0.5);
      if (date) { add(`${latin}ddd`, big * 0.4); add(`${latin}d MMM`, big * 0.4); }
      return { ...base, layers, arrange: (boxes) => stackCentered(boxes, W, H, [0, big * 0.12, big * 0.25, big * 0.1]) };
    }

    // Long strip with a date: time on the left, day and date stacked on the right.
    if (isStrip(c) && date) {
      const big = Math.min(H * 0.72, W * 0.2);
      add('HH:mm', big);
      add(`${latin}ddd`, H * 0.3);
      add(`${latin}d MMM`, H * 0.3);
      return {
        ...base, layers,
        arrange: ([t, d1, d2]) => {
          const gap = H * 0.25, total = t.w + gap + Math.max(d1.w, d2.w), x0 = (W - total) / 2, xd = x0 + t.w + gap;
          const dh = d1.h + d2.h + 1, yd = (H - dh) / 2;
          return [{ x: x0, y: (H - t.h) / 2 }, { x: xd, y: yd }, { x: xd, y: yd + d1.h + 1 }];
        },
      };
    }

    const big = isStrip(c) && !date
      ? Math.min(H * 0.75, W * (seconds ? 0.17 : 0.24))
      : Math.min(H * (date ? 0.34 : 0.45), W * (seconds ? 0.17 : 0.24));
    add(seconds ? 'HH:mm:ss' : 'HH:mm', big);
    if (date) add(`${latin}${H < 48 ? 'd MMM' : 'ddd d MMM'}`, big * 0.42);
    return { ...base, layers, arrange: (boxes) => stackCentered(boxes, W, H, [0, big * 0.2]) };
  },
};

// Stacks boxes vertically, each centred horizontally, the whole stack centred on the screen.
// gaps[i] is the space above box i.
function stackCentered(boxes: { w: number; h: number }[], W: number, H: number, gaps: number[]) {
  const gap = (i: number) => (i ? gaps[Math.min(i, gaps.length - 1)] : 0);
  const total = boxes.reduce((s, b, i) => s + b.h + gap(i), 0);
  let y = (H - total) / 2;
  return boxes.map((b, i) => {
    y += gap(i);
    const at = { x: (W - b.w) / 2, y };
    y += b.h;
    return at;
  });
}

// ---------------------------------------------------------------------------------------------
// Eye moods (templates/eyes.ts), one template each plus every mood back to back.

const EYE_OPTIONS: OptionDef[] = [
  { id: 'style', label: 'Style', type: 'choice', choices: [['auto', 'Auto'], ['robot', 'Robot'], ['cartoon', 'Cartoon'], ['single', 'Single eye']] },
  { id: 'color', label: 'Eye color', type: 'color' },
  { id: 'bg', label: 'Background', type: 'color' },
  { id: 'size', label: 'Eye size', type: 'choice', choices: [['0.8', 'Small'], ['1', 'Medium'], ['1.15', 'Large']] },
  { id: 'look', label: 'Look', type: 'choice', choices: [['1', 'Fine, smooth edges'], ['2', 'Pixels ×2'], ['4', 'Pixels ×4 (smallest file)']] },
];

function eyeOptions(c: TemplateCtx, o: Options): EyeOptions {
  const base = defaultEyeOptions(c.mono, c.round);
  return {
    ...base,
    style: o.style === 'auto' ? base.style : (o.style as EyeOptions['style']),
    eyeColor: o.color, irisColor: o.color, bgColor: o.bg,
    size: Number(o.size), pixel: Number(o.look),
  };
}

function eyeTemplate(id: string, name: string, icon: string, hint: string, anims: () => EyeAnim[]): AnimTemplate {
  return {
    id, name, icon, hint, category: 'eyes', pixel: 1, canvas: true,
    options: EYE_OPTIONS,
    defaults: { style: 'auto', color: '#2ee6ff', bg: '#000000', size: '1', look: '1' },
    generate(c, o) {
      const eo = eyeOptions(c, o);
      let canvas: Generated['canvas'];
      const frames = anims().flatMap((a) => {
        const g = generateEyes(c.screenW, c.screenH, a, eo);
        canvas = { w: g.width, h: g.height, scale: g.scale };
        return g.frames;
      });
      return { frames, canvas, background: c.mono ? '#000000' : eo.bgColor };
    },
  };
}

const EYES: AnimTemplate[] = [
  ...EYE_ANIMS.map((a) => eyeTemplate(`eyes-${a.id}`, a.name, a.icon, 'Eye mood', () => [a])),
  eyeTemplate('eyes-all', 'All moods in one', 'eye', 'Every mood back to back', () => EYE_ANIMS.filter((a) => a.id !== 'look-around')),
];

export const TEMPLATES: AnimTemplate[] = [
  clock, ...EYES, heart, fire, stars, rain, snow, wave, plasma, bounce, pacman, fireworks, emojiBounce, marquee,
  spinner, warp, matrix, equalizer, battery, wifi, radar, life,
];

// ---------------------------------------------------------------------------------------------

export function canvasFor(screen: DisplayPreset, pixel: number) {
  const min = Math.min(screen.width, screen.height);
  let scale = Math.max(1, Math.min(8, Math.round((pixel * min) / 240)));
  if (pixel >= 3 && min >= 64) scale = Math.max(2, scale); // pixel-art templates stay chunky on small panels
  return { scale, w: Math.floor(screen.width / scale), h: Math.floor(screen.height / scale) };
}

export function templateContext(t: AnimTemplate, presetId: string): TemplateCtx {
  const screen = getPreset(presetId);
  const { scale, w, h } = canvasFor(screen, t.pixel);
  return { w, h, scale, mono: screen.color === 'mono', round: screen.round, screenW: screen.width, screenH: screen.height };
}

// Builds an editor project; `speed` scales every frame delay (2 = twice as fast).
export function templateProject(t: AnimTemplate, presetId: string, o: Options, speed = 1): Project {
  const c = templateContext(t, presetId);
  const g = t.generate(c, { ...t.defaults, ...o });
  const w = g.canvas?.w ?? c.w, h = g.canvas?.h ?? c.h;
  const p = createProject({
    presetId, width: w, height: h, scale: g.canvas?.scale ?? c.scale, name: t.name, background: g.background ?? '#000000',
    frames: g.frames.map((f) => newFrame(w, h, Math.max(20, Math.round(f.delay / speed)), f.data)),
  });
  if (c.mono && !t.smoothMono) p.adjust.dither = 'none';
  if (g.layers?.length) {
    p.layers = g.layers;
    // Place clock layers now that their rendered size is known.
    const w = widgetsFor(p);
    if (w) {
      const boxes = p.layers.map((l) => w.boxes[w.layers.findIndex((x) => x.id === l.id)] ?? { w: 0, h: 0 });
      const at = g.arrange?.(boxes) ?? boxes.map((b, i) => ({ x: (c.screenW - b.w) / 2, y: g.layers![i].y }));
      p.layers = p.layers.map((l, i) =>
        w.layers.some((x) => x.id === l.id) ? { ...l, x: Math.round(at[i].x), y: Math.round(at[i].y) } : l);
    }
  }
  return p;
}
