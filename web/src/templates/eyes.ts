// Procedural eye animations ("robot eyes" style and cartoon eyes) rendered for any display.
// An animation is a list of keyframes; each keyframe tweens the eye pose and then holds it.
// Holds are stored as longer frame delays instead of duplicate frames, which keeps files small.

import type { Pixels } from '../model/types';

export type EyeStyle = 'robot' | 'cartoon' | 'single';

export interface EyeOptions {
  style: EyeStyle;
  eyeColor: string; // robot eye / cartoon heart & accents
  irisColor: string; // cartoon iris
  bgColor: string;
  size: number; // 0.6..1.3
  spacing: number; // 0.4..1.6
  fps: number;
  pixel: number; // 1 = full resolution (smooth edges), 2/4 = chunky pixels
  rotate: 0 | 90 | 270; // draw landscape eyes on a portrait panel mounted sideways
  mono: boolean;
}

export interface EyePose {
  lookX: number; // -1 (left) .. 1 (right)
  lookY: number; // -1 (up) .. 1 (down)
  open: number; // 0 closed .. 1 open
  scale: number;
  angry: number; // inner lid slant
  sad: number; // outer lid slant
  tired: number; // flat top lid
  happy: number; // bottom lid arch (^ ^)
  heart: number; // > 0.5 draws a heart
  spiral: number; // > 0.5 draws a spiral
  spin: number; // spiral rotation (radians)
  pupil: number; // cartoon pupil size
  bounce: number; // vertical offset, -1 up .. 1 down
  shake: number; // horizontal offset
  tear: number; // 0 none, 0..1 falling tear
  zzz: number; // 0 none, 0..1 floating Z
}

export const NEUTRAL: EyePose = {
  lookX: 0, lookY: 0, open: 1, scale: 1, angry: 0, sad: 0, tired: 0, happy: 0, heart: 0, spiral: 0,
  spin: 0, pupil: 1, bounce: 0, shake: 0, tear: 0, zzz: 0,
};

interface Key {
  both?: Partial<EyePose>;
  L?: Partial<EyePose>;
  R?: Partial<EyePose>;
  ms?: number; // tween duration (0 = cut)
  hold?: number; // extra time on the final pose
  linear?: boolean;
}

export interface EyeAnim {
  id: string;
  name: string;
  emoji: string;
  keys: Key[];
}

const blink = (holdAfter = 500): Key[] => [
  { both: { open: 0.05 }, ms: 70, hold: 30 },
  { both: { open: 1 }, ms: 110, hold: holdAfter },
];

const repeat = (n: number, keys: Key[]): Key[] => Array.from({ length: n }, () => keys).flat();

export const EYE_ANIMS: EyeAnim[] = [
  {
    id: 'look-lr', name: 'มองซ้าย-ขวา', emoji: '👀',
    keys: [
      { hold: 600 },
      { both: { lookX: -1 }, ms: 220, hold: 800 },
      { both: { lookX: 1 }, ms: 380, hold: 800 },
      { both: { lookX: 0 }, ms: 220, hold: 300 },
      ...blink(400),
    ],
  },
  {
    id: 'look-around', name: 'มองรอบ ๆ', emoji: '🔄',
    keys: [
      { hold: 400 },
      { both: { lookX: -1 }, ms: 200, hold: 500 },
      { both: { lookX: -0.8, lookY: -0.8 }, ms: 200, hold: 400 },
      { both: { lookX: 0, lookY: -1 }, ms: 200, hold: 400 },
      { both: { lookX: 0.8, lookY: -0.8 }, ms: 200, hold: 400 },
      { both: { lookX: 1, lookY: 0 }, ms: 200, hold: 500 },
      { both: { lookX: 0.6, lookY: 0.9 }, ms: 250, hold: 400 },
      { both: { lookX: 0, lookY: 0 }, ms: 250, hold: 300 },
      ...blink(300),
    ],
  },
  {
    id: 'idle', name: 'ปกติ (กะพริบตา)', emoji: '🙂',
    keys: [
      { hold: 1600 },
      ...blink(1400),
      { both: { lookX: 0.35, lookY: 0.15 }, ms: 250, hold: 900 },
      { both: { lookX: 0, lookY: 0 }, ms: 250, hold: 600 },
      ...blink(120),
      ...blink(1200),
    ],
  },
  {
    id: 'happy', name: 'ดีใจ', emoji: '😄',
    keys: [
      { hold: 300 },
      { both: { happy: 1, scale: 1.05 }, ms: 180, hold: 200 },
      ...repeat(3, [
        { both: { bounce: -1 }, ms: 140 },
        { both: { bounce: 0 }, ms: 140 },
      ]),
      { hold: 700 },
      { both: { happy: 0, scale: 1 }, ms: 220, hold: 400 },
    ],
  },
  {
    id: 'sad', name: 'เศร้า', emoji: '😢',
    keys: [
      { hold: 300 },
      { both: { sad: 1, lookY: 0.6, scale: 0.95 }, ms: 500, hold: 300 },
      { both: { tear: 1 }, ms: 1400, linear: true },
      { both: { tear: 0 }, ms: 0, hold: 300 },
      { both: { tear: 1 }, ms: 1400, linear: true },
      { both: { tear: 0 }, ms: 0, hold: 400 },
      { both: { sad: 0, lookY: 0, scale: 1 }, ms: 400, hold: 300 },
    ],
  },
  {
    id: 'angry', name: 'โกรธ', emoji: '😠',
    keys: [
      { hold: 300 },
      { both: { angry: 1, tired: 0.12 }, ms: 160, hold: 250 },
      ...repeat(2, [
        { both: { shake: 1 }, ms: 45 },
        { both: { shake: -1 }, ms: 70 },
      ]),
      { both: { shake: 0 }, ms: 45, hold: 700 },
      { both: { lookX: -0.7 }, ms: 180, hold: 350 },
      { both: { lookX: 0.7 }, ms: 260, hold: 350 },
      { both: { lookX: 0 }, ms: 180, hold: 500 },
      { both: { angry: 0, tired: 0 }, ms: 250, hold: 300 },
    ],
  },
  {
    id: 'surprised', name: 'ตกใจ', emoji: '😲',
    keys: [
      { hold: 500 },
      { both: { scale: 1.3, pupil: 0.45 }, ms: 90, hold: 1000 },
      ...blink(100),
      ...blink(600),
      { both: { scale: 1, pupil: 1 }, ms: 350, hold: 600 },
    ],
  },
  {
    id: 'sleepy', name: 'ง่วงนอน', emoji: '😴',
    keys: [
      { hold: 400 },
      { both: { tired: 0.45 }, ms: 700, hold: 300 },
      { both: { tired: 0.8, open: 0.7 }, ms: 900, hold: 200 },
      { both: { open: 0.05, tired: 0.3 }, ms: 500, hold: 200 },
      { both: { zzz: 1 }, ms: 1800, linear: true },
      { both: { zzz: 0 }, ms: 0 },
      { both: { zzz: 1 }, ms: 1800, linear: true },
      { both: { zzz: 0, open: 1, tired: 0.2 }, ms: 120, hold: 400 },
      { both: { tired: 0 }, ms: 300, hold: 300 },
    ],
  },
  {
    id: 'love', name: 'หลงรัก', emoji: '😍',
    keys: [
      { both: { heart: 1 }, ms: 0, hold: 200 },
      ...repeat(4, [
        { both: { scale: 1.18 }, ms: 160 },
        { both: { scale: 0.95 }, ms: 200, hold: 120 },
      ]),
      { both: { scale: 1 }, ms: 150, hold: 500 },
    ],
  },
  {
    id: 'wink', name: 'ขยิบตา', emoji: '😉',
    keys: [
      { hold: 600 },
      { both: { happy: 0.25 }, ms: 150 },
      { R: { open: 0.08, happy: 0.6 }, ms: 110, hold: 700 },
      { R: { open: 1, happy: 0.25 }, ms: 130, hold: 500 },
      { both: { happy: 0 }, ms: 200, hold: 500 },
    ],
  },
  {
    id: 'suspicious', name: 'สงสัย', emoji: '🤨',
    keys: [
      { hold: 300 },
      { L: { tired: 0.55 }, R: { scale: 1.12 }, ms: 300, hold: 300 },
      { both: { lookX: -0.8 }, ms: 900, hold: 500 },
      { both: { lookX: 0.8 }, ms: 1200, hold: 500 },
      { both: { lookX: 0 }, ms: 400, hold: 300 },
      { L: { tired: 0 }, R: { scale: 1 }, ms: 300, hold: 400 },
    ],
  },
  {
    id: 'dizzy', name: 'มึนงง', emoji: '😵',
    keys: [
      { both: { spiral: 1, spin: 0 }, ms: 0 },
      { both: { spin: Math.PI * 6 }, ms: 2400, linear: true },
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// Rendering

interface Colors {
  bg: string;
  eye: string;
  sclera: string;
  outline: string;
  iris: string;
  pupil: string;
  highlight: string;
  tear: string;
  heart: string;
}

function colorsFor(o: EyeOptions): Colors {
  if (o.mono) {
    return o.style === 'robot'
      ? { bg: '#000000', eye: '#ffffff', sclera: '#ffffff', outline: '#ffffff', iris: '#000000', pupil: '#000000', highlight: '#ffffff', tear: '#ffffff', heart: '#ffffff' }
      : { bg: '#000000', eye: '#ffffff', sclera: '#ffffff', outline: '#000000', iris: '#000000', pupil: '#000000', highlight: '#ffffff', tear: '#ffffff', heart: '#ffffff' };
  }
  return {
    bg: o.bgColor,
    eye: o.eyeColor,
    sclera: '#f4f6fa',
    outline: '#15171c',
    iris: o.irisColor,
    pupil: '#0b0c10',
    highlight: '#ffffff',
    tear: '#5fc8ff',
    heart: o.style === 'robot' ? o.eyeColor : '#ff3d6e',
  };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function lerpPose(a: EyePose, b: EyePose, t: number): EyePose {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof EyePose)[]) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

function lid(ctx: OffscreenCanvasRenderingContext2D, pts: number[][], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
}

function heartPath(ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.05, cx - s * 0.75, cy - s * 1.05, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.75, cy - s * 1.05, cx + s * 1.4, cy - s * 0.05, cx, cy + s * 0.9);
  ctx.closePath();
}

// side: -1 = viewer's left eye, 1 = right eye, 0 = single eye
function drawEye(
  ctx: OffscreenCanvasRenderingContext2D, cx: number, cy: number, ew: number, eh: number,
  p: EyePose, side: number, o: EyeOptions, c: Colors, H: number,
) {
  // The eye on the side being looked at grows slightly: reads as turning the head.
  const depth = o.style === 'robot' && side !== 0 ? 1 + 0.08 * p.lookX * side : 1;
  const w = ew * p.scale * depth;
  const fullH = eh * p.scale * depth;
  const h = Math.max(fullH * 0.06, fullH * Math.min(1, p.open));
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;

  if (p.heart > 0.5) {
    ctx.fillStyle = c.heart;
    heartPath(ctx, cx, cy, Math.min(w, fullH) * 1.05);
    ctx.fill();
    return;
  }

  if (p.spiral > 0.5) {
    const r = Math.min(w, fullH) / 2;
    if (o.style !== 'robot') {
      ctx.fillStyle = c.sclera;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = o.style === 'robot' ? c.eye : c.iris;
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const turns = 2.6;
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const a = p.spin * (side >= 0 ? 1 : -1) + t * turns * Math.PI * 2;
      const rr = r * 0.85 * t;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    return;
  }

  if (o.style === 'robot') {
    ctx.fillStyle = c.eye;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, Math.min(w, h) * 0.28);
    ctx.fill();
  } else {
    // Cartoon: sclera, iris following the gaze, pupil, highlight.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = c.sclera;
    ctx.fill();
    ctx.clip();
    const ir = w * (o.style === 'single' ? 0.3 : 0.27);
    const ix = cx + p.lookX * (w / 2 - ir) * 0.85, iy = cy + p.lookY * (fullH / 2 - ir) * 0.75;
    ctx.fillStyle = c.iris;
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.pupil;
    ctx.beginPath();
    ctx.arc(ix, iy, ir * 0.52 * p.pupil, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.highlight;
    ctx.beginPath();
    ctx.arc(ix - ir * 0.35, iy - ir * 0.38, ir * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!o.mono) {
      ctx.strokeStyle = c.outline;
      ctx.lineWidth = Math.max(1, w * 0.035);
      ctx.beginPath();
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Eyelids are drawn in the background color over the eye.
  const pad = Math.max(2, w * 0.06);
  const L = x0 - pad, R = x1 + pad, T = y0 - pad;
  if (p.tired > 0.01) lid(ctx, [[L, T], [R, T], [R, y0 + h * 0.5 * p.tired], [L, y0 + h * 0.5 * p.tired]], c.bg);
  if (side === 0) {
    if (p.angry > 0.01) lid(ctx, [[L, T], [R, T], [R, y0 + h * 0.3 * p.angry], [cx, y0 + h * 0.55 * p.angry], [L, y0 + h * 0.3 * p.angry]], c.bg);
    if (p.sad > 0.01) lid(ctx, [[L, T], [R, T], [R, y0 + h * 0.5 * p.sad], [cx, y0 + h * 0.15 * p.sad], [L, y0 + h * 0.5 * p.sad]], c.bg);
  } else {
    // Inner corner is the one nearest the nose: right corner of the left eye, left corner of the right eye.
    const innerRight = side < 0;
    if (p.angry > 0.01) {
      const d = y0 + h * 0.6 * p.angry;
      lid(ctx, innerRight ? [[L, T], [R, T], [R, d]] : [[L, T], [R, T], [L, d]], c.bg);
    }
    if (p.sad > 0.01) {
      const d = y0 + h * 0.55 * p.sad;
      lid(ctx, innerRight ? [[L, T], [R, T], [L, d]] : [[L, T], [R, T], [R, d]], c.bg);
    }
  }
  if (p.happy > 0.01) {
    // An ellipse rising from below leaves an arch: ^ ^
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    ctx.ellipse(cx, y1 + h * (1.1 - 0.75 * p.happy), w * 0.85, h * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (p.tear > 0.02 && side >= 0) {
    const tx = side === 0 ? x0 + w * 0.2 : x1 - w * 0.18;
    const ty = y1 + (H - y1 + w * 0.2) * p.tear * 0.9 + w * 0.05;
    const tr = Math.max(2, w * 0.08);
    ctx.fillStyle = c.tear;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI);
    ctx.lineTo(tx, ty - tr * 2.2);
    ctx.closePath();
    ctx.fill();
  }

  if (p.zzz > 0.02 && side >= 0) {
    ctx.fillStyle = c.eye === c.bg ? c.highlight : o.style === 'robot' ? c.eye : c.sclera;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const t = (p.zzz + i / 3) % 1;
      const fs = Math.max(6, w * (0.18 + 0.22 * t));
      ctx.font = `bold ${Math.round(fs)}px sans-serif`;
      ctx.globalAlpha = o.mono ? 1 : Math.min(1, (1 - t) * 2.5);
      ctx.fillText('z', x1 + w * 0.05 + t * w * 0.3, y0 - t * fullH * 0.55);
    }
    ctx.globalAlpha = 1;
  }
}

function drawFrame(ctx: OffscreenCanvasRenderingContext2D, W: number, H: number, l: EyePose, r: EyePose, o: EyeOptions, c: Colors) {
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  const margin = Math.max(1, Math.min(W, H) * 0.04);

  if (o.style === 'single') {
    const ew = Math.min(W, H) * 0.72 * o.size;
    const maxDX = Math.max(0, (W - ew) / 2 - margin) * 0.35;
    const maxDY = Math.max(0, (H - ew) / 2 - margin) * 0.35;
    const cx = W / 2 + l.lookX * maxDX + l.shake * ew * 0.08;
    const cy = H / 2 + l.lookY * maxDY + l.bounce * ew * 0.08;
    drawEye(ctx, cx, cy, ew, ew, l, 0, o, c, H);
    return;
  }

  let ew = Math.min(W * (H > W * 1.3 ? 0.4 : 0.3), H * 0.62) * o.size;
  let eh = Math.min(ew * (o.style === 'robot' ? 1.05 : 1.2), H * 0.72);
  let gap = ew * 0.38 * o.spacing;
  const total = ew * 2 + gap;
  if (total > W - 2 * margin) {
    const k = (W - 2 * margin) / total;
    ew *= k; eh *= k; gap *= k;
  }
  // Robot eyes move as a whole; cartoon eyes mostly move the iris.
  const travel = o.style === 'robot' ? 1 : 0.3;
  const maxDX = Math.max(0, (W - (ew * 2 + gap)) / 2 - margin) * travel;
  const maxDY = Math.max(0, (H - eh) / 2 - margin) * travel;
  const place = (p: EyePose, side: number) => {
    const cx = W / 2 + side * (gap / 2 + ew / 2) + p.lookX * maxDX + p.shake * ew * 0.12;
    const cy = H / 2 + p.lookY * maxDY + p.bounce * eh * 0.12;
    drawEye(ctx, cx, cy, ew, eh, p, side, o, c, H);
  };
  place(l, -1);
  place(r, 1);
}

function hexRgb(hex: string): number[] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Snap every pixel to the nearest style color: crisp pixel-art edges and very few colors.
function snapToPalette(data: Pixels, c: Colors) {
  const pal = [...new Set(Object.values(c))].map(hexRgb);
  const cache = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let best = cache.get(key);
    if (best === undefined) {
      let bd = Infinity;
      best = 0;
      for (let k = 0; k < pal.length; k++) {
        const dr = data[i] - pal[k][0], dg = data[i + 1] - pal[k][1], db = data[i + 2] - pal[k][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = k; }
      }
      cache.set(key, best);
    }
    data[i] = pal[best][0];
    data[i + 1] = pal[best][1];
    data[i + 2] = pal[best][2];
    data[i + 3] = 255;
  }
}

export interface GeneratedEyes {
  width: number;
  height: number;
  scale: number;
  frames: { data: Pixels; delay: number }[];
}

export function generateEyes(screenW: number, screenH: number, anim: EyeAnim, o: EyeOptions): GeneratedEyes {
  const width = Math.floor(screenW / o.pixel), height = Math.floor(screenH / o.pixel);
  // Landscape drawing area when rotated for a sideways-mounted portrait panel.
  const dw = o.rotate ? height : width, dh = o.rotate ? width : height;
  const draw = new OffscreenCanvas(dw, dh).getContext('2d')!;
  const out = o.rotate ? new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })! : null;
  const c = colorsFor(o);
  const frameMs = Math.round(1000 / o.fps);
  const frames: GeneratedEyes['frames'] = [];

  const render = (l: EyePose, r: EyePose, delay: number) => {
    drawFrame(draw, dw, dh, l, r, o, c);
    let data: Pixels;
    if (out) {
      out.save();
      if (o.rotate === 90) {
        out.translate(width, 0);
        out.rotate(Math.PI / 2);
      } else {
        out.translate(0, height);
        out.rotate(-Math.PI / 2);
      }
      out.drawImage(draw.canvas, 0, 0);
      out.restore();
      data = out.getImageData(0, 0, width, height).data;
    } else {
      data = draw.getImageData(0, 0, width, height).data;
    }
    if (o.pixel > 1 || o.mono) snapToPalette(data, c);
    frames.push({ data, delay });
  };

  let L = { ...NEUTRAL }, R = { ...NEUTRAL };
  for (const key of anim.keys) {
    const tL = { ...L, ...key.both, ...key.L };
    const tR = { ...R, ...key.both, ...key.R };
    const steps = Math.round((key.ms ?? 0) / frameMs);
    if (steps === 0) {
      L = tL; R = tR;
      const changesPose = !!(key.both || key.L || key.R);
      if (changesPose || frames.length === 0) render(L, R, Math.max(frameMs, key.hold ?? 0));
      else frames[frames.length - 1].delay += key.hold ?? 0; // pure hold: stretch the last frame
      continue;
    }
    for (let i = 1; i <= steps; i++) {
      const t = key.linear ? i / steps : ease(i / steps);
      const last = i === steps;
      render(lerpPose(L, tL, t), lerpPose(R, tR, t), frameMs + (last ? key.hold ?? 0 : 0));
    }
    L = tL; R = tR;
  }
  return { width, height, scale: o.pixel, frames };
}
