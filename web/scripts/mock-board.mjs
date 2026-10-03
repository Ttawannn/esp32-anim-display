// Fake board for developing the editor without hardware. Implements the firmware REST API
// (docs/api.md) in memory.
//   node scripts/mock-board.mjs            (listens on :8787)
//   DEVICE=localhost:8787 npm run dev      (editor proxies /api to it)
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const PRESETS = [
  { id: 'st7735s_80x160', name: 'TFT 0.96" ST7735S 80x160', width: 80, height: 160, color: 'rgb565', round: false },
  { id: 'st7789_240x240', name: 'TFT 1.3" ST7789 240x240', width: 240, height: 240, color: 'rgb565', round: false },
  { id: 'gc9a01_240_round', name: 'TFT 1.28" round GC9A01 240x240', width: 240, height: 240, color: 'rgb565', round: true },
  { id: 'ssd1306_128x64', name: 'OLED 0.96" SSD1306 128x64', width: 128, height: 64, color: 'mono', round: false },
  { id: 'ssd1306_128x32', name: 'OLED 0.91" SSD1306 128x32', width: 128, height: 32, color: 'mono', round: false },
];
const FS_TOTAL = 2_228_224;

const state = {
  anims: new Map(), // name -> Buffer
  playlist: { enabled: false, shuffle: false, items: [] },
  display: {
    preset: process.env.PRESET ?? 'st7789_240x240', rotation: 0, offset_x: 0, offset_y: 0, invert: true, bgr: false,
    mirror_x: false, spi_hz: 40000000, spi_mode: 3, i2c_hz: 800000, i2c_addr: 60, brightness: 255,
    pins: { clk: 6, data: 7, cs: 10, dc: 4, rst: 3, bl: 5 },
  },
  wifi: { mode: 'ap', ssid: 'DisplayEditor-MOCK', ip: '192.168.4.1', rssi: 0, saved_ssid: '' },
  player: { name: '', playing: false, live: false, playlist: false, frame: 0, frames: 0, fps: 0 },
  scanStarted: 0,
};

const used = () => [...state.anims.values()].reduce((s, b) => s + b.length + 512, 4096);
const preset = () => PRESETS.find((p) => p.id === state.display.preset);

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
    case 'GET /api/info': {
      const p = preset();
      return send(res, 200, {
        version: '0.2.0-mock', board: 'c3', board_name: 'Mock board', chip: 'mock', heap_free: 180000, heap_min: 150000, uptime_s: Math.round(process.uptime()),
        display: { ok: true, preset: p.id, name: p.name, width: p.width, height: p.height, color: p.color, shape: p.round ? 'round' : 'rect', brightness: state.display.brightness },
        fs: { total: FS_TOTAL, used: used(), free: FS_TOTAL - used() },
        wifi: { ...state.wifi, hostname: 'display.local' },
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
      return send(res, 200, { ok: true, name, size: data.length });
    }
    case 'DELETE /api/anims':
      if (!state.anims.delete(q('name'))) return send(res, 404, { error: 'not found' });
      if (state.player.name === q('name')) state.player = { ...state.player, name: '', playing: false };
      return send(res, 200, { ok: true });
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
    case 'PUT /api/playlist':
      state.playlist = JSON.parse((await readBody(req)).toString());
      return send(res, 200, { ok: true });
    case 'GET /api/display':
      return send(res, 200, state.display);
    case 'PUT /api/display':
      state.display = { ...state.display, ...JSON.parse((await readBody(req)).toString()) };
      return send(res, 200, { ok: true });
    case 'GET /api/display/presets':
      return send(res, 200, { presets: PRESETS });
    case 'POST /api/display/test':
    case 'POST /api/reboot':
      return send(res, 200, { ok: true });
    case 'POST /api/brightness':
      state.display.brightness = Number(q('value'));
      return send(res, 200, { ok: true });
    case 'GET /api/wifi':
      return send(res, 200, state.wifi);
    case 'PUT /api/wifi':
      state.wifi.saved_ssid = JSON.parse((await readBody(req)).toString()).ssid;
      return send(res, 200, { ok: true });
    case 'DELETE /api/wifi':
      state.wifi.saved_ssid = '';
      return send(res, 200, { ok: true });
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
