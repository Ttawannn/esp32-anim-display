// The display module drawn around the screen, the way it looks in real life: board colour,
// mounting holes, pin header with labels, ribbon cable, silkscreen text. It turns with the chosen
// rotation so it is obvious which way the module is mounted; the screen content stays upright.
//
// Modules are drawn in millimetres, in the panel's rotation-0 orientation (firmware numbering:
// rotation 1 = module turned a quarter counter-clockwise, content still upright).

import type { ComponentChildren } from 'preact';
import { basePresetId, getPreset, presetRotation } from '../model/presets';

interface Pin { x: number; y: number; label: string }
interface ModuleSpec {
  w: number;
  h: number;
  pcb: string; // board colour
  shape?: 'round'; // round board with a pin tab (GC9A01)
  active: { x: number; y: number; w: number; h: number }; // visible pixels
  glass: { x: number; y: number; w: number; h: number; round?: boolean };
  holes: [number, number, number][]; // x, y, r
  pins: Pin[];
  labelSide: 'below' | 'above' | 'right' | 'left'; // where pin labels sit relative to the pins
  fpc?: { x: number; y: number; w: number; h: number; color: string };
  text?: { x: number; y: number; size: number; lines: string[]; rotate?: number; anchor?: 'start' | 'middle' };
}

const BLUE = '#1f5bb5';
const BLACK = '#17191d';
const pinsRow = (labels: string[], x0: number, y: number, step = 2.54): Pin[] => labels.map((label, i) => ({ x: x0 + i * step, y, label }));
const pinsCol = (labels: string[], x: number, y0: number, step = 2.54): Pin[] => labels.map((label, i) => ({ x, y: y0 + i * step, label }));

const MODULES: Record<string, ModuleSpec> = {
  // 0.96" 80×160 IPS (ST7735S): at rotation 0 it lies landscape the way its text reads, header on
  // top, ribbon on the left.
  tft096: {
    w: 30.5, h: 24, pcb: BLUE,
    active: { x: 5.2, y: 8.9, w: 21.7, h: 10.8 },
    glass: { x: 3.5, y: 7.4, w: 25.4, h: 13.8 },
    holes: [[2.6, 2.6, 1.3], [27.9, 2.6, 1.3], [2.6, 21.4, 1.3], [27.9, 21.4, 1.3]],
    pins: pinsRow(['GND', 'VCC', 'SCL', 'SDA', 'RES', 'DC', 'CS', 'BLK'], 6.32, 2.3),
    labelSide: 'below',
    fpc: { x: 0, y: 10, w: 3.5, h: 8.6, color: '#6e6a3c' },
    text: { x: 15.3, y: 22.7, size: 1.5, lines: ['0.96"80x160(RGB)IPS'], anchor: 'middle' },
  },
  // 1.3" 240×240 IPS (ST7789, GMT130): header on top, ribbon below the glass.
  gmt130: {
    w: 28, h: 39, pcb: BLUE,
    active: { x: 2.3, y: 7.4, w: 23.4, h: 23.4 },
    glass: { x: 1.2, y: 6.2, w: 25.6, h: 28.2 },
    holes: [[2.4, 2.4, 1.4], [25.6, 2.4, 1.4], [2.4, 36.6, 1.4], [25.6, 36.6, 1.4]],
    pins: pinsRow(['GND', 'VCC', 'SCK', 'SDA', 'RES', 'DC', 'BLK'], 6.4, 2.1),
    labelSide: 'below',
    fpc: { x: 6, y: 31.5, w: 16, h: 2.4, color: '#2a2f38' },
    text: { x: 14, y: 36.3, size: 1.6, lines: ['GMT130-V1.0', 'IPS 240*240'], anchor: 'middle' },
  },
  // 1.28" round 240×240 (GC9A01): round board, pin tab at the bottom.
  round128: {
    w: 38, h: 45, pcb: BLUE, shape: 'round',
    active: { x: 2.8, y: 2.8, w: 32.4, h: 32.4 },
    glass: { x: 1.4, y: 1.4, w: 35.2, h: 35.2, round: true },
    holes: [[5.2, 41.6, 1.1], [32.8, 41.6, 1.1]],
    pins: pinsRow(['RST', 'CS', 'DC', 'SDA', 'SCL', 'GND', 'VCC'], 11.4, 42.6),
    labelSide: 'above',
    fpc: { x: 14.5, y: 36.4, w: 9, h: 1.8, color: '#2a2f38' },
  },
  // 0.96" OLED 128×64 (SSD1306): black board, header on top, ribbon at the bottom.
  oled096: {
    w: 27.3, h: 27.8, pcb: BLACK,
    active: { x: 2.8, y: 7.6, w: 21.7, h: 10.9 },
    glass: { x: 0.9, y: 5.8, w: 25.5, h: 18.8 },
    holes: [[1.9, 1.9, 1], [25.4, 1.9, 1], [1.9, 25.9, 1], [25.4, 25.9, 1]],
    pins: pinsRow(['GND', 'VCC', 'SCL', 'SDA'], 9.8, 1.9),
    labelSide: 'below',
    fpc: { x: 9.5, y: 24.6, w: 8.3, h: 3.2, color: '#d9a21b' },
  },
  // 0.91" OLED 128×32 (SSD1306): long black strip, header on the left.
  oled091: {
    w: 38, h: 12, pcb: BLACK,
    active: { x: 9.6, y: 3.2, w: 22.4, h: 5.6 },
    glass: { x: 6.4, y: 0.9, w: 30, h: 10.2 },
    holes: [],
    pins: pinsCol(['GND', 'VCC', 'SCL', 'SDA'], 1.9, 2.2),
    labelSide: 'right',
    fpc: { x: 36.4, y: 3.3, w: 1.6, h: 5.4, color: '#d9a21b' },
  },
};

function moduleFor(presetId: string): ModuleSpec {
  const id = basePresetId(presetId);
  if (id.startsWith('st7735s')) return MODULES.tft096;
  if (id.startsWith('gc9a01')) return MODULES.round128;
  if (id.startsWith('st7789')) return MODULES.gmt130;
  if (id === 'ssd1306_128x32') return MODULES.oled091;
  return MODULES.oled096;
}

// Labels printed on the module's pin header, in header order.
export function modulePins(presetId: string): string[] {
  return moduleFor(presetId).pins.map((p) => p.label);
}

// Turns a rect a quarter counter-clockwise r times around the board centre (container coordinates).
function turn(r: number, w: number, h: number, x: number, y: number, rw: number, rh: number) {
  for (let i = 0; i < (r & 3); i++) {
    [x, y, rw, rh, w, h] = [y, w - x - rw, rh, rw, h, w];
  }
  return { x, y, w: rw, h: rh, W: w, H: h };
}

// Size of the framed module relative to the (rotated) screen: multiply the screen size by these.
export function frameFactor(presetId: string): { fx: number; fy: number } {
  const m = moduleFor(presetId);
  const odd = presetRotation(presetId) & 1;
  return odd ? { fx: m.h / m.active.h, fy: m.w / m.active.w } : { fx: m.w / m.active.w, fy: m.h / m.active.h };
}

// Pixel scale that fits the framed module in a box.
export function fitFrame(presetId: string, maxW: number, maxH: number): number {
  const s = getPreset(presetId);
  const { fx, fy } = frameFactor(presetId);
  return Math.min(maxW / (s.width * fx), maxH / (s.height * fy));
}

export function ModuleFrame(props: {
  presetId: string; // rotation is taken from the id ("…@1")
  screenW: number; // displayed size of the screen area in CSS pixels (rotated orientation)
  screenH: number;
  background?: string; // colour of the screen area around the content
  pinColors?: Record<string, string>; // pin label -> wire colour (wiring guide)
  children: ComponentChildren;
}) {
  const m = moduleFor(props.presetId);
  const r = presetRotation(props.presetId);
  const odd = r & 1;
  const k = (odd ? props.screenH : props.screenW) / m.active.w; // CSS px per mm
  const box = turn(r, m.w, m.h, m.active.x, m.active.y, m.active.w, m.active.h);
  const W = box.W * k, H = box.H * k;
  const label = (p: Pin) => {
    const off = 1.55;
    const [x, y, anchor, rot] = m.labelSide === 'below' ? [p.x, p.y + off + 0.6, 'middle', 0]
      : m.labelSide === 'above' ? [p.x, p.y - off - 0.2, 'start', -90]
      : m.labelSide === 'right' ? [p.x + off, p.y + 0.5, 'start', 0]
      : [p.x - off, p.y + 0.5, 'end', 0];
    return (
      <text x={x} y={y} font-size={m.labelSide === 'below' ? 0.82 : 1.2} fill={props.pinColors?.[p.label] ?? '#e8eef8'} text-anchor={anchor} font-family="Arial, sans-serif" font-weight="700"
        transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{p.label}</text>
    );
  };
  return (
    <div class={`module-frame${m.shape ? ' round' : ''}`} style={{ width: W, height: H }}>
      <svg viewBox={`0 0 ${m.w} ${m.h}`} width={m.w * k} height={m.h * k} aria-hidden="true"
        style={{ left: (W - m.w * k) / 2, top: (H - m.h * k) / 2, transform: `rotate(${-90 * r}deg)` }}>
        <defs>
          <linearGradient id="pcb-shade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity=".12" />
            <stop offset="1" stop-color="#000000" stop-opacity=".18" />
          </linearGradient>
        </defs>
        {m.shape === 'round' ? (
          <g fill={m.pcb}>
            <circle cx={m.w / 2} cy={m.w / 2} r={m.w / 2} />
            <rect x={3} y={m.w / 2} width={m.w - 6} height={m.h - m.w / 2} rx={2.5} />
          </g>
        ) : <rect width={m.w} height={m.h} rx={1.2} fill={m.pcb} />}
        {m.shape === 'round'
          ? <g fill="url(#pcb-shade)"><circle cx={m.w / 2} cy={m.w / 2} r={m.w / 2} /><rect x={3} y={m.w / 2} width={m.w - 6} height={m.h - m.w / 2} rx={2.5} /></g>
          : <rect width={m.w} height={m.h} rx={1.2} fill="url(#pcb-shade)" />}
        {m.holes.map(([x, y, rr]) => (
          <g key={`${x},${y}`}>
            <circle cx={x} cy={y} r={rr + 0.55} fill="#d9dde3" />
            <circle cx={x} cy={y} r={rr} fill="#0d1016" />
          </g>
        ))}
        {m.fpc && <rect x={m.fpc.x} y={m.fpc.y} width={m.fpc.w} height={m.fpc.h} rx={0.3} fill={m.fpc.color} />}
        {m.glass.round
          ? <circle cx={m.glass.x + m.glass.w / 2} cy={m.glass.y + m.glass.h / 2} r={m.glass.w / 2} fill="#0a0c10" stroke="#3a4250" stroke-width={0.25} />
          : <rect x={m.glass.x} y={m.glass.y} width={m.glass.w} height={m.glass.h} rx={0.4} fill="#0a0c10" stroke="#3a4250" stroke-width={0.25} />}
        {m.pins.map((p) => (
          <g key={p.label}>
            {props.pinColors?.[p.label] && <circle cx={p.x} cy={p.y} r={1.25} fill={props.pinColors[p.label]} />}
            <circle cx={p.x} cy={p.y} r={0.95} fill="#c9a24a" />
            <circle cx={p.x} cy={p.y} r={0.45} fill="#2a2208" />
            {label(p)}
          </g>
        ))}
        {m.text && m.text.lines.map((line, i) => {
          const x = m.text!.x, y = m.text!.y + i * m.text!.size * 1.3;
          return (
            <text key={line} x={x} y={y} font-size={m.text!.size} fill="#e8eef8" font-family="Arial, sans-serif" font-weight="700"
              text-anchor={m.text!.anchor ?? 'start'} transform={m.text!.rotate ? `rotate(${m.text!.rotate} ${x} ${y})` : undefined}>{line}</text>
          );
        })}
      </svg>
      <div class={`module-screen${m.shape ? ' round' : ''}`}
        style={{ left: box.x * k, top: box.y * k, width: props.screenW, height: props.screenH, background: props.background ?? '#000' }}>
        {props.children}
      </div>
    </div>
  );
}
