// Client for the board API (firmware/src/net/api.cpp, docs/api.md), over Wi-Fi or USB.
// Over Wi-Fi, an empty host means the board that served this page; otherwise http://<host>.

import { PRESETS } from '../model/presets';
import { CHUNK_BYTES, fromBase64, toBase64, type SerialLink } from './serial';
import { invalidateThumbnails } from './thumbnailCache';

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

// ---------------------------------------------------------------------------------------------
// Transports: the same calls go over Wi-Fi (HTTP) or a USB cable (Web Serial, see serial.ts).

interface Transport {
  api(method: string, path: string, query?: Record<string, string | number>, body?: unknown): Promise<any>;
  upload(name: string, bytes: Uint8Array, play: boolean, onProgress?: (sent: number, total: number) => void): Promise<void>;
  live(bytes: Uint8Array): Promise<void>;
  readFile(name: string, max: number): Promise<Uint8Array>;
}

const ERRORS: Record<string, string> = {
  'not enough storage': 'พื้นที่บนบอร์ดไม่พอ',
  'not a valid .dpa file': 'ไฟล์ไม่ใช่ .dpa ที่ถูกต้อง',
  'invalid file name': 'ชื่อไฟล์ใช้ไม่ได้',
  'not found': 'ไม่พบไฟล์',
  'frame too large or out of memory': 'เฟรมใหญ่เกินไปสำหรับดูสด',
  'unknown op': 'เฟิร์มแวร์บนบอร์ดเก่าเกินไป — แฟลชเฟิร์มแวร์เวอร์ชันใหม่',
  'command queue full': 'บอร์ดกำลังทำงานเต็มคิว — ลองอีกครั้ง',
  'cannot save file': 'บอร์ดบันทึกไฟล์ไม่ได้ — ไฟล์เดิมยังเก็บไว้',
  'write failed (storage full?)': 'พื้นที่บนบอร์ดไม่พอสำหรับบันทึกไฟล์',
  'display unavailable': 'จอบนบอร์ดยังไม่พร้อม — ตรวจสายและตั้งค่าจอ',
  'cannot save settings': 'บอร์ดบันทึกค่าตั้งไม่ได้ — ลองอีกครั้ง',
  'cannot save playlist': 'บอร์ดบันทึก playlist ไม่ได้ — รายการเดิมยังเก็บไว้',
};

function errorFrom(status: number, body: any): Error {
  const e = body?.error;
  return new Error(e ? ERRORS[e] ?? e : `บอร์ดตอบ ${status}`);
}

function queryString(query?: Record<string, string | number>) {
  if (!query) return '';
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  return qs ? '?' + qs : '';
}

async function waitUpload(id: number | undefined, read: () => Promise<{ state: string; error?: string }>) {
  // Older firmware returns no receipt; new firmware must confirm the loop-task rename.
  if (id === undefined) return;
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    const result = await read();
    if (result.state === 'saved') return;
    if (result.state === 'failed') throw errorFrom(500, result);
    if (result.state !== 'pending') throw new Error('สถานะการบันทึกไฟล์ไม่ถูกต้อง');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('ยังยืนยันการบันทึกไฟล์ไม่ได้ — ตรวจรายการไฟล์บนบอร์ด');
}

class HttpTransport implements Transport {
  constructor(private host: string) {}

  private base() {
    const h = this.host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    return h ? `http://${h}` : '';
  }

  private async fetch(path: string, init?: RequestInit, timeoutMs = 6000): Promise<Response> {
    // A page served over HTTPS (the online editor) may not call a plain-HTTP board on the LAN.
    if (location.protocol === 'https:') {
      throw new Error('เว็บออนไลน์ติดต่อบอร์ดผ่าน Wi-Fi ไม่ได้ — กด "เชื่อมผ่าน USB" หรือเปิดหน้าเว็บจากบอร์ด (http://192.168.4.1)');
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    let r: Response;
    try {
      r = await fetch(this.base() + path, { ...init, signal: ctl.signal });
    } catch {
      throw new Error(`ติดต่อบอร์ดไม่ได้ (${this.base() || location.host}) — ตรวจว่าอยู่ใน Wi-Fi เดียวกับบอร์ด`);
    } finally {
      clearTimeout(t);
    }
    if (!r.ok) {
      let body: any = null;
      try {
        body = await r.json();
      } catch {
        /* not JSON */
      }
      throw errorFrom(r.status, body);
    }
    return r;
  }

  async api(method: string, path: string, query?: Record<string, string | number>, body?: unknown) {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await this.fetch(path + queryString(query), init);
    let result;
    try { result = await response.json(); }
    catch { throw new Error('ที่อยู่นี้ไม่ใช่ API ของบอร์ด — ตรวจ IP หรือเชื่อมผ่าน USB'); }
    await waitUpload(result.command_id, () => this.api('GET', '/api/commands/status', { id: result.command_id }));
    return result;
  }

  async upload(name: string, bytes: Uint8Array, play: boolean) {
    const form = new FormData();
    form.append('file', new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `${name}.dpa`);
    const receipt = await (await this.fetch(`/api/anims${queryString({ play: play ? 1 : 0, name })}`, { method: 'POST', body: form }, 120000)).json();
    await waitUpload(receipt.upload_id, () => this.api('GET', '/api/uploads/status', { id: receipt.upload_id }));
  }

  async live(bytes: Uint8Array) {
    await this.fetch('/api/live', { method: 'POST', body: bytes as BodyInit, headers: { 'Content-Type': 'application/octet-stream' } }, 8000);
  }

  async readFile(name: string, max: number) {
    return new Uint8Array(await (await this.fetch(`/api/anims/file${queryString({ name, max })}`, undefined, 15000)).arrayBuffer());
  }
}

class UsbTransport implements Transport {
  constructor(private link: SerialLink) {}

  private async call(msg: Record<string, unknown>, timeoutMs?: number) {
    const r = await this.link.request(msg, timeoutMs);
    if (r.status < 200 || r.status >= 300) throw errorFrom(r.status, r.body);
    return r;
  }

  async api(method: string, path: string, query?: Record<string, string | number>, body?: unknown) {
    const q = query ? Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) : undefined;
    return this.link.exclusive(async () => {
      const result = (await this.call({ op: 'api', method, path, query: q, body })).body;
      await waitUpload(result?.command_id, async () => (await this.call({ op: 'api', method: 'GET',
        path: '/api/commands/status', query: { id: String(result.command_id) } })).body);
      return result;
    });
  }

  private async put(kind: 'file' | 'live', bytes: Uint8Array, extra: Record<string, unknown>, onProgress?: (s: number, t: number) => void) {
    return this.link.exclusive(async () => {
      try {
        await this.call({ op: 'put_begin', kind, size: bytes.length, ...extra });
        for (let off = 0; off < bytes.length; off += CHUNK_BYTES) {
          await this.call({ op: 'put_data', data: toBase64(bytes.subarray(off, off + CHUNK_BYTES)) });
          onProgress?.(Math.min(off + CHUNK_BYTES, bytes.length), bytes.length);
        }
        const receipt = await this.call({ op: 'put_end' }, 15000);
        const id = receipt.body?.upload_id;
        if (kind === 'file') await waitUpload(id, async () =>
          (await this.call({ op: 'api', method: 'GET', path: '/api/uploads/status', query: { id: String(id) } })).body);
      } catch (e) {
        if (this.link.isOpen) await this.call({ op: 'put_abort' }, 1500).catch(() => {});
        throw e;
      }
    });
  }

  upload(name: string, bytes: Uint8Array, play: boolean, onProgress?: (s: number, t: number) => void) {
    return this.put('file', bytes, { name, play }, onProgress);
  }

  live(bytes: Uint8Array) {
    return this.put('live', bytes, {});
  }

  async readFile(name: string, max: number) {
    return this.link.exclusive(() => this.readFileChunks(name, max));
  }

  private async readFileChunks(name: string, max: number) {
    const parts: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const r = await this.call({ op: 'read', name, offset: got, length: Math.min(CHUNK_BYTES, max - got) });
      const chunk = fromBase64(r.data ?? '');
      parts.push(chunk);
      got += chunk.length;
      if (!chunk.length || got >= max || got >= (r.size ?? 0)) break;
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const part of parts) {
      out.set(part, o);
      o += part.length;
    }
    return out;
  }
}

// The USB link, when connected, takes over from Wi-Fi.
let usbLink: SerialLink | null = null;
let usbSession = 0;
export function setUsbLink(link: SerialLink | null) {
  if (usbLink !== link) usbSession++;
  usbLink = link;
}
export function usbConnected() {
  return !!usbLink?.isOpen;
}
// USB may point at a different board while the Wi-Fi host field stays the same.
export function deviceConnectionKey(host: string): string {
  return usbConnected() ? `usb:${usbSession}` : `wifi:${host}`;
}
const transport = (host: string): Transport => (usbLink?.isOpen ? new UsbTransport(usbLink) : new HttpTransport(host));

export const device = {
  info: (host: string): Promise<DeviceInfo> => transport(host).api('GET', '/api/info'),
  list: (host: string): Promise<{ anims: AnimFile[]; free: number }> => transport(host).api('GET', '/api/anims'),

  upload: async (host: string, name: string, bytes: Uint8Array, play = true, onProgress?: (sent: number, total: number) => void) => {
    const connection = deviceConnectionKey(host);
    await transport(host).upload(name, bytes, play, onProgress);
    invalidateThumbnails(connection, name);
  },

  // First `max` bytes of a file on the board (thumbnails).
  fileHead: (host: string, name: string, max = 65536): Promise<Uint8Array> => transport(host).readFile(name, max),

  remove: async (host: string, name: string) => {
    const connection = deviceConnectionKey(host);
    await transport(host).api('DELETE', '/api/anims', { name });
    invalidateThumbnails(connection, name);
  },
  play: async (host: string, name: string) => { await transport(host).api('POST', '/api/play', { name }); },
  stop: async (host: string) => { await transport(host).api('POST', '/api/stop'); },
  next: async (host: string) => { await transport(host).api('POST', '/api/next'); },

  live: (host: string, bytes: Uint8Array) => transport(host).live(bytes),
  liveEnd: async (host: string) => { await transport(host).api('POST', '/api/live/end'); },

  playlist: (host: string): Promise<PlaylistData> => transport(host).api('GET', '/api/playlist'),
  savePlaylist: async (host: string, pl: PlaylistData) => { await transport(host).api('PUT', '/api/playlist', undefined, pl); },

  display: (host: string): Promise<DisplaySettings> => transport(host).api('GET', '/api/display'),
  saveDisplay: async (host: string, d: Partial<DisplaySettings>) => { await transport(host).api('PUT', '/api/display', undefined, d); },
  presets: async (host: string): Promise<DevicePreset[]> => (await transport(host).api('GET', '/api/display/presets')).presets,
  testPattern: async (host: string) => { await transport(host).api('POST', '/api/display/test'); },
  brightness: async (host: string, value: number) => { await transport(host).api('POST', '/api/brightness', { value }); },

  wifi: (host: string): Promise<{ mode: string; ssid: string; ip: string; rssi: number; saved_ssid: string }> =>
    transport(host).api('GET', '/api/wifi'),
  scan: (host: string): Promise<{ scanning: boolean; networks?: WifiNetwork[] }> => transport(host).api('GET', '/api/wifi/scan'),
  saveWifi: async (host: string, ssid: string, password: string) => {
    await transport(host).api('PUT', '/api/wifi', undefined, { ssid, password });
  },
  forgetWifi: async (host: string) => { await transport(host).api('DELETE', '/api/wifi'); },
  reboot: async (host: string) => { await transport(host).api('POST', '/api/reboot'); },
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
