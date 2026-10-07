// The supported boards' fixed wiring. Mirrors kPins in firmware/src/board.h.

import type { DisplaySettings } from './api';

export type Pins = DisplaySettings['pins'];
export type PinKey = keyof Pins;

interface BoardSpec {
  name: string;
  pins: Pins;
  notes: Record<number, string>; // what else sits on a pin, shown next to it
  marks?: 'D'; // silkscreen: "D18" instead of just "18"
}

export const BOARDS: Record<string, BoardSpec> = {
  c3: {
    name: 'ESP32-C3 SuperMini',
    pins: { clk: 6, data: 7, cs: 10, dc: 4, rst: 3, bl: 5 },
    notes: { 20: 'RX', 21: 'TX' },
  },
  c6: {
    name: 'ESP32-C6 SuperMini',
    pins: { clk: 6, data: 7, cs: 14, dc: 20, rst: 21, bl: 22 },
    notes: { 16: 'TX', 17: 'RX' },
  },
  // ESP32 (WROOM-32) DevKit with 30 pins. CLK/DATA on VSPI's own pins (18/23).
  esp32: {
    name: 'ESP32 DevKit 30-pin',
    pins: { clk: 18, data: 23, cs: 5, dc: 16, rst: 17, bl: 4 },
    notes: { 16: 'RX2', 17: 'TX2' },
    marks: 'D',
  },
};

export function boardSpec(board: string | undefined): BoardSpec {
  return BOARDS[board ?? ''] ?? BOARDS.c3;
}

// The signals a display uses, in the order they are wired. `names` are the labels printed on
// modules for that signal; the first one that the drawn module carries is shown.
export interface Signal { key: PinKey; names: string[] }

export function signalsFor(mono: boolean): Signal[] {
  if (mono) return [{ key: 'clk', names: ['SCL'] }, { key: 'data', names: ['SDA'] }];
  return [
    { key: 'clk', names: ['SCL', 'SCK', 'CLK'] },
    { key: 'data', names: ['SDA', 'MOSI', 'DIN'] },
    { key: 'rst', names: ['RES', 'RST'] },
    { key: 'dc', names: ['DC', 'RS', 'A0'] },
    { key: 'cs', names: ['CS'] },
    { key: 'bl', names: ['BLK', 'BL', 'LED'] },
  ];
}

// Wire colours, also used to mark the module's pins.
export const WIRE_COLORS: Record<PinKey | 'vcc' | 'gnd', string> = {
  vcc: '#e5484d', gnd: '#5b6170', clk: '#f5b74e', data: '#46a758', rst: '#8e8cf0', dc: '#3e9bf5', cs: '#e879c6', bl: '#f2f2f2',
};
