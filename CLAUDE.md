# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web editor (`web/`) that creates animations and a firmware (`firmware/`) for ESP32-C3 / ESP32-C6 SuperMini boards and the 30-pin ESP32 DevKit that plays them on small TFT/OLED panels, connected over Wi-Fi. The two halves communicate through a custom binary format, `.dpa`, plus a REST API. The user works in Thai. The UI is English by default with a Thai switch (EN / ไทย, remembered per browser); all documentation is in English.

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
python -m platformio run                          # all envs: c3_supermini, c6_supermini, esp32_devkit
python -m platformio run -e c3_supermini -t upload
python -m platformio device monitor               # 115200, type "help"
```

### Native decoder test (from repo root, no ESP32 needed)

```bash
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/src firmware/test/native/decode_test.cpp -o build/decode_test.exe
build/decode_test.exe shared/test-vectors
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/src firmware/test/native/widgets_test.cpp -o build/widgets_test.exe
build/widgets_test.exe shared/test-vectors   # clock widgets vs the JS reference renderer
# controller/robustness tests use assert(): zig defines NDEBUG at -O1, so pass -UNDEBUG (CI uses g++)
python -m ziglang c++ -std=c++17 -O1 -w -UNDEBUG -Ifirmware/test/native/stubs -Ifirmware/src firmware/test/native/controller_test.cpp firmware/src/app/controller.cpp firmware/src/app/commands.cpp -o build/controller_test.exe
```

## Hosting

`.github/workflows/pages.yml` publishes GitHub Pages on every push to main:
- `/`: the editor (`web/dist`)
- `/flash/`: the ESP Web Tools installer from `site/flash/`, with freshly built `firmware.factory.bin` for both boards

`.github/workflows/ci.yml` is validation only.

## Architecture

### The core contract: `.dpa`

The browser does all heavy work: GIF/video decoding, resampling, color adjustment, dithering, palette quantization, RLE, and delta-rect computation. The board only streams pre-sized frames from flash to the panel in bands. It has no full framebuffer, because the boards have no PSRAM.

The format is implemented twice and must stay byte-compatible:

- **Encoder (TypeScript):** `web/src/codec/dpa.ts`
- **Decoder (C++):** `firmware/src/player/dpa.h` and `decoder.h`

`decoder.h` is deliberately Arduino-free so the native test can compile it. `web/src/codec/vectors.test.ts` writes `shared/test-vectors/*.dpa` plus the expected pixels, and the native test must reproduce them exactly.

When changing the format, update all of these together, then rerun both test suites and commit the regenerated vectors:

- `docs/dpa-format.md`
- the encoder
- the decoder
- the vectors

Frame types are INDEXED (palette + RLE), JPEG (baseline, decoded by JPEGDEC), and MONO (SSD1306 page layout + RLE).

Live date/time ("clock widgets") travel in an optional widget block between the palette and the frame table (header flag bit 0; older firmware ignores it). The editor pre-renders every glyph as 4-bit alpha. The board lays out the current time and blends glyphs into pixels on their way to the panel (`player/widgets.h`), so the JS renderer in `web/src/layers/widgets.ts` and the C++ one must match exactly. Because the panel cannot be read back, every frame's rect includes the canvas area under the widgets, and the player redraws the held frame when the displayed time changes. Two properties of every file:

- **Delta frames:** each frame stores only the rect that changed, so the panel itself holds the previous frame. Frame 0 is always a keyframe.
- **Holds:** a still pose is stored as a longer delay on one frame, not as duplicate frames.

### Firmware threading model

- **Loop task:** the only task that may touch the panel or the player. It runs `controllerLoop()`, which drains a FreeRTOS command queue (`app/commands`) and drives `player/player`, the playlist, overlays, and live preview.
- **HTTP handlers (`net/web.cpp`):** these run in the AsyncTCP task. They must never draw; they post to the command queue with `commandPost()`.
- **Uploads:** the handler validates a unique temp file, then posts `Cmd::CommitUpload`. The loop task replaces the file while preserving a recoverable backup and publishes an upload receipt; clients poll that receipt before reporting success.
- **Status reads:** `/api/info` reads player state through the lock-protected `statusPublish()` / `statusRead()` snapshot.
- **URL matching:** ESPAsyncWebServer's default string URI matching is prefix-like (`/api/live` also matches `/api/live/end`). Register routes with `exact()`.

### Displays

Panels are configured at runtime, with no recompiling:

- **Configuration:** `DisplayConfig` (stored in NVS) = a preset from `display/presets.cpp` plus overrides (rotation, offsets, invert, BGR, mirror, bus speed). The pins are not configurable.
- **Drivers:** only two. `PanelSpiRgb565` uses `esp_lcd` panel IO with two DMA band buffers. `PanelI2cMono` uses `Wire` with a 1-bit page framebuffer and flushes only dirty pages.
- **Adding a panel:** usually just a preset entry with its init byte sequence. A preset's `turn` picks the controller rotation used as rotation 0, so rotation 0 is the side where the module's text reads upright (the 0.96" IPS is landscape 160×80, `turn` 3); preset width/height are that rotation-0 size.
- **Applying changes:** display config changes take effect on reboot.
- **Rotation per animation:** every `.dpa` written by the editor sets the panel rotation (header flags bit 1, rotation in bits 2-3, absolute, firmware numbering: 1 = module turned a quarter counter-clockwise). The player turns the panel at runtime (`Panel::setRotation`, no reboot) and info/test screens go back to the board's own `cfg.rotation`. 1-bit panels turn only by 180°.

Web presets (`web/src/model/presets.ts`) carry geometry only. A project's display id may carry its rotation (`st7789_240x240@1`); `getPreset()` returns the rotated geometry, so everything that sizes the screen follows the rotation automatically. Compare panels with `sameDisplay()` (ignores rotation). `ui/ModuleFrame.tsx` draws each module to scale (board, holes, labelled pins, ribbon) around the preview, the editing canvas, the gallery and the wizard, turned with the rotation. Boards are matched to editor presets by width, height, color, and round shape (`presetForDevice`), so firmware-only variants such as `sh1106_128x64` and `st7735s_80x160_b` need no web entry.

### Board facts that shape the code

- **Pins (fixed per board, `kPins` in `board.h`):** CLK/DATA are GPIO6/7 on the C3/C6 (SPI2 IO_MUX pins) and GPIO18/23 on the ESP32 DevKit, whose panel uses SPI3/VSPI for that reason (`kHost` in `panel_spi_rgb565.cpp`). IO_MUX pins allow 80 MHz, and I2C shares them.
- **Wiring guide:** `web/src/device/boards.ts` mirrors `kPins` for `ui/WiringGuide.tsx` (read-only: wizard wiring step, Display settings → Wiring, the top bar's Wiring dialog). `DisplayConfig.pins` stays in the stored struct for compatibility, but `configLoad()` always resets it to `kPins` and the API ignores `pins`.
- **BOOT button (GPIO9; GPIO0 on the ESP32):** it is a strapping pin, so safe mode is triggered by pressing BOOT while the boot screen is shown, not by holding it through reset.
- **Serial:** the C3/C6 use their native USB (`custom_usb_cdc_flags` in `platformio.ini`, VID 0x303a); the ESP32 DevKit uses UART0 through a CP2102/CH340 at 115200, so `device/serial.ts` also accepts those USB vendor IDs.
- **C3 Wi-Fi:** the C3 SuperMini needs reduced TX power (`WiFi.setTxPower(WIFI_POWER_8_5dBm)`) for reliable Wi-Fi.
- **Flash layout:** the 4 MB flash defaults to `partitions/4mb_storage.csv` (1.75 MB app, about 2.1 MB LittleFS for `/anims/*.dpa`). `board_upload.maximum_size` must match the app partition.

### UI language (`web/src/i18n/`)

- Source strings are English: wrap every UI string in `t('English text')`, with `{name}` placeholders (`t('Installing {pct}%', { pct })`). Never hard-code Thai in UI code.
- `i18n/th.ts` maps English → Thai. `i18n.test.ts` fails when a literal `t('…')` string or a data label has no Thai entry, or when Thai appears outside the allowed content files (clock names in `layers/clock.ts`). In dev, Thai mode logs `[i18n] no Thai for:` for dynamic strings it can't find.
- Data modules (templates, catalogue, eye moods, palettes, clock presets) keep English labels and the UI translates them when rendering (`t(tpl.name)`), so workers never need translations. English errors thrown in workers are translated when shown (`translateKnown`, used by `toast`).
- Names that end up on the board (installed templates, eye moods, the message file) are translated at install time.

### Web editor state

- **Store:** `web/src/model/store.ts` is a single store.
  - `store.set()`: UI state, no undo.
  - `store.commit(project)`: an undoable project change.
  - `setLive()` / `endLive()`: slider drags, recorded as one undo step.
  - `load()`: replaces the project and clears history.
- **Frames are immutable:** every edit replaces a frame's `data` buffer (`Pixels = Uint8ClampedArray<ArrayBuffer>`). Undo snapshots share untouched frames by reference, and caches are keyed on buffer identity (`WeakMap`).
- **Single source of truth for the panel image:** `render/output.ts` (adjustments, RGB565 or 1-bit, color limit). The device preview, the import dialogs, and the encoder all go through it.
- **Generated animations:** `templates/eyes.ts` produces procedural eye animations from keyframes (tween, then hold-as-delay). `templates/gallery.ts` holds the template gallery: one place for the eye moods (wrapping `eyes.ts`, category `eyes`), the clock and the generated animations; the Create menu and the start screen both open it (`openTemplates(id?, category?)`). Templates are pure pixel code (`kit.ts`) so tests can run them, except those marked `canvas` (text/emoji). The gallery has its own rotation picker, and templates are generated for the rotated screen: portrait screens (`isTall`) and long strips (`isStrip`) get their own layouts (stacked clock, standing battery, Pac-Man running down, rolling text), and eyes are always drawn upright.
- **Layers (`project.layers`, `layers/`):** objects placed on top of every frame.
  - Stickers (emoji / icon / text) are rasterized at canvas resolution and baked in `processFrame`, so the preview, encoder and live view all see them.
  - Clocks are screen-resolution widgets drawn by the board. Their glyph atlas is built on the main thread with the page's fonts (`widgetsFor`) and passed to the encode worker.
  - The select tool (`V`) moves and resizes layers on the canvas. The insert tab's tiles are drag sources (`INSERT_MIME`).
- **Board client:** `device/api.ts` uses HTTP or Web Serial. `firmware/src/net/api.cpp` is shared by HTTP (`net/web.cpp`) and USB (`app/serial_rpc.cpp`); see `docs/usb-protocol.md`. Serialize entire USB transfers, including their save receipt. Keep `web/scripts/mock-board.mjs` in sync with API changes.
- **Encoding:** use `codec/encode.ts` for estimates, downloads, uploads, and live preview. It shares a bounded cache and runs `codec/dpa.ts` in a Worker without detaching immutable project buffers.
- **Editor shell:**
  - `TopBar` holds the File/Create menus, `ConnectionChip` (the single place for USB / Wi-Fi connection, live preview and the board manager), and the primary "send to board" button.
  - Every send goes through `device/send.ts` (`sendToBoard`, with progress in `store.sending`).
  - A blank project shows `StartScreen`.
  - `SetupWizard` opens by itself (editor and remote) while the board reports `display.configured === false`.
  - Board settings forms (`BoardSettings.tsx`: display, Wi-Fi, name) are shared by the board manager, the remote and the wizard.
  - Anything generated for the board's display and installed directly (wizard, remote templates, text messages) goes through `device/install.ts`.
  - While a board is connected, the preview panel follows the board's display (`presetForDevice`) instead of offering a dropdown.
  - The side panel keeps the display preview on top, with color / adjust / export tabs below (`store.sideTab`).
- **Two pages:** `main.tsx` routes by hash.
  - `#/editor` is the full editor (`ui/App.tsx`).
  - `#/remote` is the phone remote (`ui/RemoteApp.tsx`).
  - Without a hash, phones that reach a board (served by it, or the dev proxy flag `VITE_DEVICE_PROXY`) get the remote.
  - Remote thumbnails (`device/thumbs.ts`) download files via `/api/anims/file` and show the longest-held frame.
