# Architecture

```
┌──────────────────────────────── Browser (PC / phone) ───────────────────────────┐
│  Web editor (web/)                                                              │
│   pixel art · eye templates · GIF/video import · color/mono · display preview   │
│        │ RGBA frames                                                            │
│        ▼                                                                         │
│   render/output.ts ── colors as the panel shows them (RGB565 / 1-bit)            │
│        ▼                                                                         │
│   codec/dpa.ts ── .dpa file                                                      │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │ HTTP: upload / live preview / playlist / settings
┌────────────────────────────────────▼────────────────────────────────────────────┐
│  ESP32-C3 / C6 SuperMini or ESP32 DevKit (firmware/)                            │
│   net/web.cpp ──► app/commands ──► app/controller ──► player/player ──► panel   │
│      │                                       │                  │               │
│   net/wifi_manager                        playlist        storage (LittleFS)    │
│   (STA / AP + captive portal)                              /anims/*.dpa          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Principle:** all the heavy work happens in the browser: GIF/video decoding, resampling, color adjustment, dithering, color reduction and compression.
The board receives files already sized for its display; it only decodes RLE/JPEG and streams the result to the panel in bands. No full-screen framebuffer is needed, which matters because these boards have no PSRAM.

## The .dpa file

[docs/dpa-format.md](dpa-format.md) describes the header, palette, frame table, and three frame types: INDEXED (palette + RLE), JPEG, and MONO (OLED pages + RLE).
- **Delta frames:** each frame stores only the rectangle that changed since the previous frame.
- **Holds:** still poses are stored as frame delays, not repeated frames.
- **Compatibility:** the encoder (TypeScript) and the decoder (C++) must agree byte for byte. This is checked with a shared set of test vectors (see Testing).

## Firmware (`firmware/src/`)

| Folder | Responsibility |
|--------|----------------|
| `main.cpp` | boot sequence, BOOT button, LED |
| `app/controller` | decides what is on screen: playlist / last file / live preview / info screen / test pattern |
| `app/commands` | command queue from HTTP (network task) to the loop task (the only task allowed to touch the display), plus the player status snapshot |
| `app/console` | serial console for testing and display tuning |
| `app/screens` | boot screen and connection-info screen |
| `player/decoder.h` | frame decoding (no Arduino dependencies, shared with the native test) |
| `player/player` | streamed file reading, frame timing, scaling, banded output to the display, JPEG via JPEGDEC |
| `player/playlist` | `/playlist.json` |
| `storage/` | LittleFS: `/anims/<name>.dpa`, UTF-8 file names (Thai works), at most 48 bytes |
| `display/` | display drivers: SPI RGB565 (`esp_lcd` + DMA) and I2C OLED, display presets, font, test pattern |
| `net/web` | HTTP transport + embedded editor (`web_assets.h`) |
| `net/api` | shared JSON API, streaming file validation, upload receipts |
| `app/serial_rpc` | USB JSON-line transport, chunked uploads/reads, interrupted-transfer cleanup |
| `app/clock` | wall clock for date/time widgets: NTP in station mode, otherwise set by the browser (`PUT /api/time`); UTC offset kept in NVS |
| `player/widgets.h` | live clock widgets from the .dpa widget block, blended into frames on their way to the panel (Arduino-free, natively tested) |
| `net/wifi_manager` | joins the saved network, otherwise starts an AP + captive portal; mDNS `<board name>.local` (default `display-xxxx.local`, unique per board) |
| `bench/` | display and JPEG benchmarks (`bench` command) |

**Threading:** HTTP handlers run in the AsyncTCP task and must never draw. They send commands with `commandPost()`, and `controllerLoop()` in the loop task carries them out.
For uploads, the handler writes the temporary file itself (LittleFS is thread-safe), and the loop task does the rename, because that file may currently be playing.
The browser waits for an upload receipt confirming the rename. Replacement keeps a recoverable backup until the new file is installed. USB uses the same command queue and receipts.

**Flash usage (4 MB):**
- firmware about 1.4 MB, including about 57 KB of compressed editor assets
- LittleFS about 2.1 MB for animations
- display and Wi-Fi settings stored in NVS

## Web editor (`web/src/`)

| Folder | Responsibility |
|--------|----------------|
| `model/` | project, display presets, palettes, store (state + undo + autosave) |
| `editor/` | drawing tools |
| `templates/` | procedurally generated animations: 12 eye moods (`eyes.ts`) and the template gallery that lists them alongside the clock and 21 animations (`gallery.ts`, pixel helpers in `kit.ts`) |
| `layers/` | things placed on top of the animation: sticker catalogue (emoji, icons, fonts), rasterizing and baking stickers into frames, clock formats, the widget block writer/reader and its reference renderer |
| `color/` | RGB565, color adjustment, dithering, color reduction |
| `render/` | the image the panel will actually show + display preview |
| `codec/` | RLE, .dpa writer/reader, worker encoding and cached results, unit tests, test vectors |
| `import/` | GIF decoding worker, video, resampling, frame/memory budgets |
| `device/` | Wi-Fi/USB transports, connection lifecycle, live preview |
| `storage/` | IndexedDB, `.dpe` project files |
| `ui/` | UI components (Preact): the editor (`#/editor`), the board manager, and the phone remote (`#/remote`, default on phones that reach a board) |

## Testing

```bash
cd web && npm test
```
Runs the codec tests and regenerates `shared/test-vectors/*.dpa` and `*.expected`.

```bash
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/src firmware/test/native/decode_test.cpp -o build/decode_test.exe
```

```bash
build/decode_test.exe shared/test-vectors
```

The C++ decoder must reproduce the JS output pixel for pixel. To exercise the editor without a board, run these two commands in separate terminals:

```bash
cd web && npm run mock-board
```

```bash
cd web && npm run dev:mock
```

The additional native failure tests compile the real command queue/receipt code against a bounded FreeRTOS test double, and exercise streaming DPA validation and recoverable file replacement with injected filesystem failures:

```bash
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/test/native/stubs -Ifirmware/src firmware/test/native/robustness_test.cpp firmware/src/app/commands.cpp -o build/robustness_test.exe
build/robustness_test.exe shared/test-vectors
```

The controller regression test compiles the real controller with fake display/player peripherals. It verifies that stopping an overlay remains stopped after its deadline and that failed brightness persistence does not change the active configuration:

```bash
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/test/native/stubs -Ifirmware/src firmware/test/native/controller_test.cpp firmware/src/app/controller.cpp firmware/src/app/commands.cpp -o build/controller_test.exe
build/controller_test.exe
```

GitHub Actions (`.github/workflows/ci.yml`) runs typechecking, web tests, all native tests and firmware builds for C3/C6/ESP32 on pushes and pull requests. Node, PlatformIO, firmware libraries and web dependencies are pinned; use `npm ci` for installation.

Estimates use an AbortSignal and share an encoding job with exports. Removing the final consumer cancels queued work or terminates its active worker; cancellation does not stop another caller's export. GIFs decode one patch at a time in a separate worker and transfer completed RGBA buffers. Inputs are capped at 16 MB for GIF files, 64 MB of decoded RGBA frames, 2,000 frames and 4096 pixels per dimension; video extraction and encoding enforce the frame budget too. These are data limits, not a guarantee about total browser heap usage.

Thumbnail URLs use a 64-entry cache. Visible tiles retain evicted images until they unmount; other URLs are revoked on eviction/invalidation. Successful uploads invalidate the file even when its name and encoded size stay unchanged.
