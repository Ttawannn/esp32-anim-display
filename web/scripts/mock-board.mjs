// Fake board for developing the editor without hardware. Implements the firmware REST API
// (docs/api.md) in memory.
//   node scripts/mock-board.mjs            (listens on :8787)
//   DEVICE=localhost:8787 npm run dev      (editor proxies /api to it)
//   MOCK_VERSION=0.1.0 ...                 (pretend to run old firmware)
//   MOCK_FRESH=1 ...                       (display never configured: the setup wizard opens)
//   MOCK_BOARD=esp32 ...                   (board type: c3 (default), c6 or esp32)
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
// Mirrors firmware/src/board.h: default pins and the header GPIOs a display may use.
const BOARDS = {
  c3: { name: 'ESP32-C3 SuperMini', pins: { clk: 6, data: 7, cs: 10, dc: 4, rst: 3, bl: 5 }, usable: [0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 21] },
  c6: { name: 'ESP32-C6 SuperMini', pins: { clk: 6, data: 7, cs: 14, dc: 20, rst: 21, bl: 22 }, usable: [0, 1, 2, 3, 4, 5, 6, 7, 14, 16, 17, 18, 19, 20, 21, 22, 23] },
  esp32: { name: 'ESP32 DevKit 30-pin', pins: { clk: 18, data: 23, cs: 5, dc: 16, rst: 17, bl: 4 }, usable: [4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33] },
};
const BOARD_ID = BOARDS[process.env.MOCK_BOARD] ? process.env.MOCK_BOARD : 'c3';
const BOARD = BOARDS[BOARD_ID];
const PRESETS = [
  { id: 'st7735s_80x160', name: 'TFT 0.96" ST7735S 80x160', width: 160, height: 80, color: 'rgb565', round: false },
  { id: 'st7789_240x240', name: 'TFT 1.3" ST7789 240x240', width: 240, height: 240, color: 'rgb565', round: false },
  { id: 'gc9a01_240_round', name: 'TFT 1.28" round GC9A01 240x240', width: 240, height: 240, color: 'rgb565', round: true },
  { id: 'ssd1306_128x64', name: 'OLED 0.96" SSD1306 128x64', width: 128, height: 64, color: 'mono', round: false },
  { id: 'ssd1306_128x32', name: 'OLED 0.91" SSD1306 128x32', width: 128, height: 32, color: 'mono', round: false },
];
const FS_TOTAL = 2_228_224;
const VERSION = process.env.MOCK_VERSION
  ?? /FIRMWARE_VERSION "([^"]+)"/.exec(readFileSync(new URL('../../firmware/src/app/app.h', import.meta.url), 'utf8'))?.[1];

// Same rule as firmware/src/net/wifi_manager.cpp: ASCII letters/digits, '-' between words.
const hostFor = (name) => (name.toLowerCase().match(/[a-z0-9]+/g) ?? []).join('-').slice(0, 24).replace(/-$/, '') || 'display-a1b2';

const state = {
  anims: new Map(), // name -> Buffer
  playlist: { enabled: false, shuffle: false, items: [] },
  display: {
    preset: process.env.PRESET ?? 'st7789_240x240', rotation: 0, offset_x: 0, offset_y: 0, invert: true, bgr: false,
    mirror_x: false, spi_hz: 40000000, spi_mode: 3, i2c_hz: 800000, i2c_addr: 60, brightness: 255,
    pins: { ...BOARD.pins },
  },
  name: 'display-a1b2',
  configured: !process.env.MOCK_FRESH,
  clock: { epoch: 0, setAt: 0, tz: 420 }, // unknown until the editor sets it, like a fresh board
  wifi: { mode: 'ap', ssid: 'DisplayEditor-MOCK', ip: '192.168.4.1', rssi: 0, saved_ssid: '' },
  player: { name: '', playing: false, live: false, playlist: false, frame: 0, frames: 0, fps: 0 },
  scanStarted: 0,
};

const clockNow = () => (state.clock.epoch ? state.clock.epoch + Math.round((Date.now() - state.clock.setAt) / 1000) : 0);
const used = () => [...state.anims.values()].reduce((s, b) => s + b.length + 512, 4096);
const uploads = new Map();
let nextUploadId = 0;
const commands = new Map();
let nextCommandId = 0;
function confirmed(res, apply) {
  const id = ++nextCommandId;
  commands.set(id, { state: 'pending' });
  setTimeout(() => { apply(); commands.set(id, { state: 'saved' }); }, 30);
  if (commands.size > 16) commands.delete(commands.keys().next().value);
  return send(res, 202, { ok: true, command_id: id });
}
const preset = () => PRESETS.find((p) => p.id === state.display.preset);

// Same rule as boardPinsError() in firmware/src/board.h.
const USABLE_PINS = BOARD.usable;
function pinsError(p) {
  const all = [p.clk, p.data, p.cs, p.dc, p.rst, p.bl];
  if (p.clk < 0 || p.data < 0) return 'invalid pin';
  if (all.some((v) => v >= 0 && !USABLE_PINS.includes(v))) return 'invalid pin';
  if (all.some((v, i) => v >= 0 && all.indexOf(v) !== i)) return 'pin used twice';
  return null;
}

function header(buf) {
  if (buf.length < 32 || buf.toString('latin1', 0, 4) !== 'DPA1') return null;
  return { colorMode: buf[5], width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), frames: buf.readUInt16LE(20) };
}

function play(name) {
  const h = header(state.anims.get(name));
  state.player = { name, playing: true, live: false, playlist: false, frame: 0, frames: h?.frames ?? 0, fps: 20 };
}

function send(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});

// Minimal multipart/form-data parser: returns the first file part.
function parseMultipart(body, contentType) {
  const boundary = '--' + /boundary=(.+)$/.exec(contentType)?.[1];
  const start = body.indexOf(boundary);
  const headerEnd = body.indexOf('\r\n\r\n', start);
  const end = body.indexOf('\r\n' + boundary, headerEnd);
  const head = body.toString('utf8', start, headerEnd);
  const filename = /filename="([^"]*)"/.exec(head)?.[1] ?? 'upload.dpa';
  return { filename, data: body.subarray(headerEnd + 4, end) };
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = (k) => url.searchParams.get(k) ?? '';
  const route = `${req.method} ${url.pathname}`;
  console.log(route, url.search);
  if (req.method === 'OPTIONS') return send(res, 204, {});

  switch (route) {
    case 'GET /api/commands/status': {
      const result = commands.get(Number(q('id')));
      return result ? send(res, 200, result) : send(res, 404, { error: 'command not found' });
    }
    case 'GET /api/info': {
      const p = preset();
      return send(res, 200, {
        version: VERSION, name: state.name, time: clockNow(), board: BOARD_ID, board_name: `Mock ${BOARD.name}`, chip: 'mock', heap_free: 180000, heap_min: 150000, uptime_s: Math.round(process.uptime()),
        display: { ok: true, preset: p.id, name: p.name, rotation: state.display.rotation,
          width: state.display.rotation & 1 ? p.height : p.width, height: state.display.rotation & 1 ? p.width : p.height, color: p.color, shape: p.round ? 'round' : 'rect', brightness: state.display.brightness,
          configured: state.configured, ...(state.configured ? {} : { detected: 'tft' }) },
        fs: { total: FS_TOTAL, used: used(), free: FS_TOTAL - used() },
        wifi: { ...state.wifi, hostname: `${hostFor(state.name)}.local` },
        player: state.player,
      });
    }
    case 'GET /api/anims':
      return send(res, 200, {
        anims: [...state.anims.entries()].sort().map(([name, b]) => {
          const h = header(b);
          return { name, size: b.length, width: h.width, height: h.height, frames: h.frames, color: h.colorMode ? 'mono' : 'rgb565' };
        }),
        free: FS_TOTAL - used(),
      });
    case 'POST /api/anims': {
      const body = await readBody(req);
      const { filename, data } = parseMultipart(body, req.headers['content-type'] ?? '');
      const name = (q('name') || filename).replace(/\.dpa$/, '');
      if (!header(data)) return send(res, 415, { error: 'not a valid .dpa file' });
      if (data.length + used() > FS_TOTAL) return send(res, 507, { error: 'not enough storage' });
      state.anims.set(name, data);
      if (q('play') !== '0') play(name);
      const uploadId = ++nextUploadId;
      uploads.set(uploadId, { state: 'saved' });
      if (uploads.size > 16) uploads.delete(uploads.keys().next().value);
      return send(res, 202, { ok: true, name, size: data.length, upload_id: uploadId });
    }
    case 'GET /api/uploads/status':
      return uploads.has(Number(q('id')))
        ? send(res, 200, uploads.get(Number(q('id')))) : send(res, 404, { error: 'upload not found' });
    case 'GET /api/anims/file': {
      const b = state.anims.get(q('name'));
      if (!b) return send(res, 404, { error: 'not found' });
      const max = Number(q('max')) || b.length;
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      return res.end(b.subarray(0, Math.min(max, b.length)));
    }
    case 'DELETE /api/anims':
      if (!state.anims.delete(q('name'))) return send(res, 404, { error: 'not found' });
      if (state.player.name === q('name')) state.player = { ...state.player, name: '', playing: false };
      return send(res, 200, { ok: true });
    case 'POST /api/anims/rename': {
      const from = q('name'), to = (q('to') ?? '').trim();
      if (!state.anims.has(from)) return send(res, 404, { error: 'not found' });
      if (!to) return send(res, 400, { error: 'invalid file name' });
      if (to === from) return send(res, 200, { ok: true });
      if (state.anims.has(to)) return send(res, 409, { error: 'name exists' });
      return confirmed(res, () => {
        state.anims.set(to, state.anims.get(from));
        state.anims.delete(from);
        if (state.player.name === from) state.player = { ...state.player, name: to };
        state.playlist.items = state.playlist.items.map((it) => (it.name === from ? { ...it, name: to } : it));
      });
    }
    case 'POST /api/play':
      if (!state.anims.has(q('name'))) return send(res, 404, { error: 'not found' });
      play(q('name'));
      return send(res, 200, { ok: true });
    case 'POST /api/stop':
      state.player = { ...state.player, playing: false };
      return send(res, 200, { ok: true });
    case 'POST /api/next': {
      const names = [...state.anims.keys()].sort();
      if (names.length) play(names[(names.indexOf(state.player.name) + 1) % names.length]);
      return send(res, 200, { ok: true });
    }
    case 'POST /api/live': {
      const body = await readBody(req);
      if (!header(body)) return send(res, 413, { error: 'frame too large or out of memory' });
      state.player = { ...state.player, live: true, name: '(live)' };
      console.log(`  live frame ${body.length} bytes`);
      return send(res, 200, { ok: true });
    }
    case 'POST /api/live/end':
      state.player = { ...state.player, live: false };
      return send(res, 200, { ok: true });
    case 'GET /api/playlist':
      return send(res, 200, state.playlist);
    case 'PUT /api/playlist': {
      const playlist = JSON.parse((await readBody(req)).toString());
      return confirmed(res, () => { state.playlist = playlist; });
    }
    case 'GET /api/display':
      return send(res, 200, state.display);
    case 'PUT /api/display': {
      const display = JSON.parse((await readBody(req)).toString());
      if (display.pins) {
        const err = pinsError({ ...state.display.pins, ...display.pins });
        if (err) return send(res, 400, { error: err });
        display.pins = { ...state.display.pins, ...display.pins };
      }
      return confirmed(res, () => { state.display = { ...state.display, ...display }; state.configured = true; });
    }
    case 'GET /api/display/presets':
      return send(res, 200, { presets: PRESETS });
    case 'POST /api/display/test':
    case 'POST /api/reboot':
      return send(res, 200, { ok: true });
    case 'POST /api/brightness':
      return confirmed(res, () => { state.display.brightness = Number(q('value')); });
    case 'GET /api/time':
      return send(res, 200, { epoch: clockNow(), tz_minutes: state.clock.tz });
    case 'PUT /api/time': {
      const t = JSON.parse((await readBody(req)).toString());
      if (!(t.epoch >= 1704067200) || !(t.tz_minutes >= -720 && t.tz_minutes <= 840)) return send(res, 400, { error: 'invalid time' });
      return confirmed(res, () => { state.clock = { epoch: t.epoch, setAt: Date.now(), tz: t.tz_minutes }; });
    }
    case 'GET /api/device':
      return send(res, 200, { name: state.name, hostname: `${hostFor(state.name)}.local` });
    case 'PUT /api/device': {
      const { name } = JSON.parse((await readBody(req)).toString());
      if (typeof name !== 'string' || Buffer.byteLength(name.trim()) > 48 || /[\u0000-\u001f\u007f]/.test(name))
        return send(res, 400, { error: 'invalid name' });
      return confirmed(res, () => { state.name = name.trim() || 'display-a1b2'; });
    }
    case 'GET /api/wifi':
      return send(res, 200, state.wifi);
    case 'PUT /api/wifi': {
      const wifi = JSON.parse((await readBody(req)).toString());
      return confirmed(res, () => { state.wifi.saved_ssid = wifi.ssid; });
    }
    case 'DELETE /api/wifi':
      return confirmed(res, () => { state.wifi.saved_ssid = ''; });
    case 'GET /api/wifi/scan':
      if (!state.scanStarted) {
        state.scanStarted = Date.now();
        return send(res, 200, { scanning: true });
      }
      if (Date.now() - state.scanStarted < 1500) return send(res, 200, { scanning: true });
      state.scanStarted = 0;
      return send(res, 200, { scanning: false, networks: [
        { ssid: 'HomeWiFi', rssi: -48, secure: true }, { ssid: 'Office-2.4G', rssi: -67, secure: true }, { ssid: 'Cafe Free', rssi: -80, secure: false },
      ] });
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`mock board on http://localhost:${PORT} (display ${state.display.preset})`));
