# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web editor (`web/`) that creates animations and a firmware (`firmware/`) for ESP32-C3 / ESP32-C6 SuperMini boards that plays them on small TFT/OLED panels, connected over Wi-Fi. The two halves communicate through a custom binary format, `.dpa`, plus a REST API. The user works in Thai. UI strings (editor and on-device screens' user text) are in Thai; all documentation is in English, with Thai UI labels quoted alongside an English gloss.

Docs worth reading before larger changes: `docs/architecture.md` (system overview), `docs/dpa-format.md` (file format), `docs/api.md` (REST API), `PLAN.md` (roadmap and status: the code compiles but has not yet been verified on real hardware).

## Commands

### Web editor (`web/`)

```bash
npm install
npm run dev                 # http://localhost:5173
npm run mock-board          # fake board on :8787 (in-memory implementation of the firmware API)
npm run dev:mock            # dev server with /api proxied to the mock board (auto-connects)
DEVICE=192.168.4.1 npm run dev   # proxy /api to a real board
npm test                    # vitest: codec tests + regenerates shared/test-vectors
npx vitest run src/codec/codec.test.ts -t "rle"   # single test
npm run typecheck
npm run build:device        # typecheck + build + gzip dist/ into firmware/src/net/web_assets.h
```

`firmware/src/net/web_assets.h` is generated but committed (the firmware serves the editor from flash). After any change under `web/src`, rerun `npm run build:device` before building the firmware.

### Firmware (`firmware/`)

`pio` is not on PATH; use `python -m platformio`. **Build from PowerShell, not Git Bash**: pioarduino's ESP-IDF tool installer fails under MSys ("MSys/Mingw is not supported").

```bash
python -m platformio run                          # both envs: c3_supermini, c6_supermini
python -m platformio run -e c3_supermini -t upload
python -m platformio device monitor               # 115200, type "help"
```

### Native decoder test (from repo root, no ESP32 needed)

```bash
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/src firmware/test/native/decode_test.cpp -o build/decode_test.exe
build/decode_test.exe shared/test-vectors
```

## Architecture

### The core contract: `.dpa`

The browser does all heavy work: GIF/video decoding, resampling, color adjustment, dithering, palette quantization, RLE, and delta-rect computation. The board only streams pre-sized frames from flash to the panel in bands. It has no full framebuffer, because the C3/C6 have no PSRAM.

The format is implemented twice and must stay byte-compatible:

- **Encoder (TypeScript):** `web/src/codec/dpa.ts`
- **Decoder (C++):** `firmware/src/player/dpa.h` and `decoder.h`

`decoder.h` is deliberately Arduino-free so the native test can compile it. `web/src/codec/vectors.test.ts` writes `shared/test-vectors/*.dpa` plus the expected pixels, and the native test must reproduce them exactly.

When changing the format, update all of these together, then rerun both test suites and commit the regenerated vectors:

- `docs/dpa-format.md`
- the encoder
- the decoder
- the vectors

Frame types are INDEXED (palette + RLE), JPEG (baseline, decoded by JPEGDEC), and MONO (SSD1306 page layout + RLE). Two properties of every file:

- **Delta frames:** each frame stores only the rect that changed, so the panel itself holds the previous frame. Frame 0 is always a keyframe.
- **Holds:** a still pose is stored as a longer delay on one frame, not as duplicate frames.

### Firmware threading model

- **Loop task:** the only task that may touch the panel or the player. It runs `controllerLoop()`, which drains a FreeRTOS command queue (`app/commands`) and drives `player/player`, the playlist, overlays, and live preview.
- **HTTP handlers (`net/web.cpp`):** these run in the AsyncTCP task. They must never draw; they post to the command queue with `commandPost()`.
- **Uploads:** the handler writes a unique temp file itself, then posts `Cmd::CommitUpload`. The loop task does the rename, because the target file may be playing.
- **Status reads:** `/api/info` reads player state through the lock-protected `statusPublish()` / `statusRead()` snapshot.
- **URL matching:** ESPAsyncWebServer's default string URI matching is prefix-like (`/api/live` also matches `/api/live/end`). Register routes with `exact()`.

### Displays

Panels are configured at runtime, with no recompiling:

- **Configuration:** `DisplayConfig` (stored in NVS) = a preset from `display/presets.cpp` plus overrides (rotation, offsets, invert, BGR, mirror, bus speed, pins).
- **Drivers:** only two. `PanelSpiRgb565` uses `esp_lcd` panel IO with two DMA band buffers. `PanelI2cMono` uses `Wire` with a 1-bit page framebuffer and flushes only dirty pages.
- **Adding a panel:** usually just a preset entry with its init byte sequence.
- **Applying changes:** display config changes take effect on reboot.

Web presets (`web/src/model/presets.ts`) carry geometry only. Boards are matched to editor presets by width, height, color, and round shape (`presetForDevice`), so firmware-only variants such as `sh1106_128x64` and `st7735s_80x160_b` need no web entry.

### Board facts that shape the code

- **Default pins:** CLK/DATA are GPIO6/7 on both boards. These are the SPI2 IO_MUX pins, which allow 80 MHz, and I2C shares them. Other pin defaults are in `board.h`.
- **GPIO9 (BOOT button):** it is a strapping pin, so safe mode is triggered by pressing BOOT while the boot screen is shown, not by holding it through reset.
- **C3 Wi-Fi:** the C3 SuperMini needs reduced TX power (`WiFi.setTxPower(WIFI_POWER_8_5dBm)`) for reliable Wi-Fi.
- **Flash layout:** the 4 MB flash defaults to `partitions/4mb_storage.csv` (1.75 MB app, about 2.1 MB LittleFS for `/anims/*.dpa`). `board_upload.maximum_size` must match the app partition.

### Web editor state

- **Store:** `web/src/model/store.ts` is a single store.
  - `store.set()`: UI state, no undo.
  - `store.commit(project)`: an undoable project change.
  - `setLive()` / `endLive()`: slider drags, recorded as one undo step.
  - `load()`: replaces the project and clears history.
- **Frames are immutable:** every edit replaces a frame's `data` buffer (`Pixels = Uint8ClampedArray<ArrayBuffer>`). Undo snapshots share untouched frames by reference, and caches are keyed on buffer identity (`WeakMap`).
- **Single source of truth for the panel image:** `render/output.ts` (adjustments, RGB565 or 1-bit, color limit). The device preview, the import dialogs, and the encoder all go through it.
- **Generated animations:** `templates/eyes.ts` produces procedural eye animations from keyframes (tween, then hold-as-delay).
- **REST client:** `device/api.ts` mirrors `firmware/src/net/web.cpp`. Keep `web/scripts/mock-board.mjs` in sync with API changes.
- **Two pages:** `main.tsx` routes by hash.
  - `#/editor` is the full editor (`ui/App.tsx`).
  - `#/remote` is the phone remote (`ui/RemoteApp.tsx`).
  - Without a hash, phones that reach a board (served by it, or the dev proxy flag `VITE_DEVICE_PROXY`) get the remote.
  - Remote thumbnails (`device/thumbs.ts`) download files via `/api/anims/file` and show the longest-held frame.
