// The supported boards' wiring. Mirrors firmware/src/board.h (kDefaultPins, kUsablePins), which
// also rejects a wiring that breaks the rules below.

import type { DisplaySettings } from './api';

export type Pins = DisplaySettings['pins'];
export type PinKey = keyof Pins;

interface BoardSpec {
  name: string;
  defaults: Pins;
  usable: number[]; // header GPIOs a display may use
  notes: Record<number, string>; // what else sits on a pin, shown next to it
  marks?: 'D'; // silkscreen: "D18" instead of just "18"
}

export const BOARDS: Record<string, BoardSpec> = {
  c3: {
    name: 'ESP32-C3 SuperMini',
    defaults: { clk: 6, data: 7, cs: 10, dc: 4, rst: 3, bl: 5 },
    usable: [0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 21],
    notes: { 20: 'RX', 21: 'TX' },
  },
  c6: {
    name: 'ESP32-C6 SuperMini',
    defaults: { clk: 6, data: 7, cs: 14, dc: 20, rst: 21, bl: 22 },
    usable: [0, 1, 2, 3, 4, 5, 6, 7, 14, 16, 17, 18, 19, 20, 21, 22, 23],
    notes: { 16: 'TX', 17: 'RX' },
  },
  // ESP32 (WROOM-32) DevKit with 30 pins. CLK/DATA on VSPI's own pins (18/23).
  esp32: {
    name: 'ESP32 DevKit 30-pin',
    defaults: { clk: 18, data: 23, cs: 5, dc: 16, rst: 17, bl: 4 },
    usable: [4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
    notes: { 16: 'RX2', 17: 'TX2' },
    marks: 'D',
  },
};

export function boardSpec(board: string | undefined): BoardSpec {
  return BOARDS[board ?? ''] ?? BOARDS.c3;
}

// The signals a display uses, in the order they are wired. `names` are the labels printed on
// modules for that signal; the first one that the drawn module carries is shown.
export interface Signal { key: PinKey; names: string[]; optional: boolean }

export function signalsFor(mono: boolean): Signal[] {
  if (mono) return [{ key: 'clk', names: ['SCL'], optional: false }, { key: 'data', names: ['SDA'], optional: false }];
  return [
    { key: 'clk', names: ['SCL', 'SCK', 'CLK'], optional: false },
    { key: 'data', names: ['SDA', 'MOSI', 'DIN'], optional: false },
    { key: 'rst', names: ['RES', 'RST'], optional: true },
    { key: 'dc', names: ['DC', 'RS', 'A0'], optional: false },
    { key: 'cs', names: ['CS'], optional: true },
    { key: 'bl', names: ['BLK', 'BL', 'LED'], optional: true },
  ];
}

// Wire colours, also used to mark the module's pins.
export const WIRE_COLORS: Record<PinKey | 'vcc' | 'gnd', string> = {
  vcc: '#e5484d', gnd: '#5b6170', clk: '#f5b74e', data: '#46a758', rst: '#8e8cf0', dc: '#3e9bf5', cs: '#e879c6', bl: '#f2f2f2',
};

// Pins used by more than one signal (only the signals this display uses count).
export function pinConflicts(pins: Pins, mono: boolean): Set<PinKey> {
  const keys = signalsFor(mono).map((s) => s.key);
  const bad = new Set<PinKey>();
  for (const a of keys) for (const b of keys) if (a !== b && pins[a] >= 0 && pins[a] === pins[b]) bad.add(a);
  return bad;
}

export function samePins(a: Pins, b: Pins): boolean {
  return (Object.keys(a) as PinKey[]).every((k) => a[k] === b[k]);
}

// Pins picked in the wiring guide before a board was connected, per board type. The setup wizard
// starts from them on a board whose display was never set up.
const REMEMBER_KEY = 'wiringPins';

export function rememberedPins(board: string | undefined): Pins | null {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? '{}')[board ?? ''] ?? null;
  } catch {
    return null;
  }
}

export function rememberPins(board: string, pins: Pins | null) {
  try {
    const all = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? '{}');
    if (pins && !samePins(pins, boardSpec(board).defaults)) all[board] = pins;
    else delete all[board];
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(all));
  } catch {
    // private mode / storage blocked: the choice just isn't kept
  }
}
