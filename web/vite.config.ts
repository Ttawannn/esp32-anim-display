import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

// The firmware version this editor ships with, so the online editor can spot outdated boards.
const firmwareVersion = /FIRMWARE_VERSION "([^"]+)"/.exec(
  readFileSync(new URL('../firmware/src/app/app.h', import.meta.url), 'utf8'),
)?.[1] ?? '0.0.0';

// DEVICE=192.168.4.1 npm run dev  -> proxies /api to a real board.
// npm run dev:mock                -> proxies /api to scripts/mock-board.mjs (npm run mock-board).
export default defineConfig(({ mode }) => {
  const device = process.env.DEVICE ?? (mode === 'mock' ? 'localhost:8787' : undefined);
  // Lets the editor auto-connect through the proxy during development (VITE_* reaches import.meta.env).
  process.env.VITE_DEVICE_PROXY = device ? '1' : '';
  return {
    plugins: [preact()],
    define: { __FIRMWARE_VERSION__: JSON.stringify(firmwareVersion) },
    base: './',
    build: {
      outDir: 'dist',
      target: 'es2022',
      assetsInlineLimit: 0,
    },
    server: device ? { proxy: { '/api': `http://${device}` } } : undefined,
  };
});
