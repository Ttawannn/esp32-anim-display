// REST client for the board (firmware/src/net/web.cpp, docs/api.md). With an empty host the page
// talks to the board that served it (the normal case); otherwise http://<host>.

import { PRESETS } from '../model/presets';

export interface DeviceInfo {
  version: string;
  board: string;
  board_name: string;
  heap_free: number;
  display: { ok: boolean; error?: string; preset: string; name: string; width: number; height: number; color: 'rgb565' | 'mono'; shape: 'round' | 'rect'; brightness: number };
  fs: { total: number; used: number; free: number };
  wifi: { mode: 'ap' | 'sta'; ssid: string; ip: string; rssi: number; hostname: string };
  player: { name: string; playing: boolean; live: boolean; playlist: boolean; frame: number; frames: number; fps: number };
}

export interface AnimFile {
  name: string;
  size: number;
  width: number;
  height: number;
  frames: number;
  color: 'rgb565' | 'mono';
}

export interface PlaylistData {
  enabled: boolean;
  shuffle: boolean;
  items: { name: string; seconds: number }[];
}

export interface DisplaySettings {
  preset: string;
  rotation: number;
  offset_x: number;
  offset_y: number;
  invert: boolean;
  bgr: boolean;
  mirror_x: boolean;
  spi_hz: number;
  spi_mode: number;
  i2c_hz: number;
  i2c_addr: number;
  brightness: number;
  pins: { clk: number; data: number; cs: number; dc: number; rst: number; bl: number };
}

export interface DevicePreset {
  id: string;
  name: string;
  width: number;
  height: number;
  color: 'rgb565' | 'mono';
  round: boolean;
}

export interface WifiNetwork {
  ssid: string;
  rssi: number;
  secure: boolean;
}

export function isServedByBoard(): boolean {
  return !['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname) && location.protocol === 'http:';
}

function base(host: string) {
  const h = host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return h ? `http://${h}` : '';
}

async function request(host: string, path: string, init?: RequestInit, timeoutMs = 6000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let r: Response;
  try {
    r = await fetch(base(host) + path, { ...init, signal: ctl.signal });
  } catch {
    throw new Error(`ติดต่อบอร์ดไม่ได้ (${base(host) || location.host}) — ตรวจว่าอยู่ใน Wi-Fi เดียวกับบอร์ด`);
  } finally {
    clearTimeout(t);
  }
  if (!r.ok) {
    let msg = `บอร์ดตอบ ${r.status}`;
    try {
      const j = await r.json();
      if (j.error) msg = ERRORS[j.error] ?? j.error;
    } catch { /* not JSON */ }
    if (r.status === 404 && path.startsWith('/api/anims') && init?.method === 'POST') {
      msg = 'เฟิร์มแวร์บนบอร์ดยังไม่รองรับการอัปโหลด — แฟลชเฟิร์มแวร์เวอร์ชันใหม่';
    }
    throw new Error(msg);
  }
  return r;
}

const ERRORS: Record<string, string> = {
  'not enough storage': 'พื้นที่บนบอร์ดไม่พอ',
  'not a valid .dpa file': 'ไฟล์ไม่ใช่ .dpa ที่ถูกต้อง',
  'invalid file name': 'ชื่อไฟล์ใช้ไม่ได้',
  'not found': 'ไม่พบไฟล์',
  'frame too large or out of memory': 'เฟรมใหญ่เกินไปสำหรับดูสด',
};

const json = (host: string, path: string, method: string, body: unknown) =>
  request(host, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = (host: string, path: string) => request(host, path, { method: 'POST' });
const q = encodeURIComponent;

export const device = {
  info: async (host: string): Promise<DeviceInfo> => (await request(host, '/api/info')).json(),

  list: async (host: string): Promise<{ anims: AnimFile[]; free: number }> => (await request(host, '/api/anims')).json(),

  upload: async (host: string, name: string, bytes: Uint8Array, play = true): Promise<void> => {
    const form = new FormData();
    form.append('file', new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `${name}.dpa`);
    await request(host, `/api/anims?play=${play ? 1 : 0}&name=${q(name)}`, { method: 'POST', body: form }, 120000);
  },

  // First `max` bytes of a file on the board (enough for the header and frame 0).
  fileHead: async (host: string, name: string, max = 65536): Promise<Uint8Array> =>
    new Uint8Array(await (await request(host, `/api/anims/file?name=${q(name)}&max=${max}`, undefined, 15000)).arrayBuffer()),

  remove: async (host: string, name: string) => { await request(host, `/api/anims?name=${q(name)}`, { method: 'DELETE' }); },
  play: async (host: string, name: string) => { await post(host, `/api/play?name=${q(name)}`); },
  stop: async (host: string) => { await post(host, '/api/stop'); },
  next: async (host: string) => { await post(host, '/api/next'); },

  live: async (host: string, bytes: Uint8Array) => {
    await request(host, '/api/live', { method: 'POST', body: bytes as BodyInit, headers: { 'Content-Type': 'application/octet-stream' } }, 8000);
  },
  liveEnd: async (host: string) => { await post(host, '/api/live/end'); },

  playlist: async (host: string): Promise<PlaylistData> => (await request(host, '/api/playlist')).json(),
  savePlaylist: async (host: string, pl: PlaylistData) => { await json(host, '/api/playlist', 'PUT', pl); },

  display: async (host: string): Promise<DisplaySettings> => (await request(host, '/api/display')).json(),
  saveDisplay: async (host: string, d: Partial<DisplaySettings>) => { await json(host, '/api/display', 'PUT', d); },
  presets: async (host: string): Promise<DevicePreset[]> => (await (await request(host, '/api/display/presets')).json()).presets,
  testPattern: async (host: string) => { await post(host, '/api/display/test'); },
  brightness: async (host: string, value: number) => { await post(host, `/api/brightness?value=${value}`); },

  wifi: async (host: string): Promise<{ mode: string; ssid: string; ip: string; rssi: number; saved_ssid: string }> =>
    (await request(host, '/api/wifi')).json(),
  scan: async (host: string): Promise<{ scanning: boolean; networks?: WifiNetwork[] }> => (await request(host, '/api/wifi/scan')).json(),
  saveWifi: async (host: string, ssid: string, password: string) => { await json(host, '/api/wifi', 'PUT', { ssid, password }); },
  forgetWifi: async (host: string) => { await request(host, '/api/wifi', { method: 'DELETE' }); },
  reboot: async (host: string) => { await post(host, '/api/reboot'); },
};

// Map the board's display to an editor preset by geometry (the firmware has extra variants).
export function presetForDevice(info: DeviceInfo): string | null {
  const d = info.display;
  const match = PRESETS.find(
    (p) => p.width === d.width && p.height === d.height && p.color === d.color && p.round === (d.shape === 'round'),
  );
  return match?.id ?? null;
}

// File names on the board are limited to 48 UTF-8 bytes.
export function deviceFileName(name: string): string {
  const clean = (name || 'animation').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().replace(/^\.+/, '') || 'animation';
  const enc = new TextEncoder();
  let out = '';
  for (const ch of clean) {
    if (enc.encode(out + ch).length > 48) break;
    out += ch;
  }
  return out;
}
