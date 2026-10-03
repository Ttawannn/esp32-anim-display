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
│  ESP32-C3 / C6 SuperMini (firmware/)                                            │
│   net/web.cpp ──► app/commands ──► app/controller ──► player/player ──► panel   │
│      │                                       │                  │               │
│   net/wifi_manager                        playlist        storage (LittleFS)    │
│   (STA / AP + captive portal)                              /anims/*.dpa          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Principle:** all the heavy work happens in the browser: GIF/video decoding, resampling, color adjustment, dithering, color reduction and compression.
The board receives files already sized for its display; it only decodes RLE/JPEG and streams the result to the panel in bands. No full-screen framebuffer is needed, which matters because the ESP32-C3/C6 have no PSRAM.

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
| `net/web` | REST API ([docs/api.md](api.md)) + embedded editor (`web_assets.h`) |
| `net/wifi_manager` | joins the saved network, otherwise starts an AP + captive portal; mDNS `display.local` |
| `bench/` | display and JPEG benchmarks (`bench` command) |

**Threading:** HTTP handlers run in the AsyncTCP task and must never draw. They send commands with `commandPost()`, and `controllerLoop()` in the loop task carries them out.
For uploads, the handler writes the temporary file itself (LittleFS is thread-safe), and the loop task does the rename, because that file may currently be playing.

**Flash usage (4 MB):**
- firmware about 1.33–1.36 MB, including the 41 KB editor
- LittleFS about 2.1 MB for animations
- display and Wi-Fi settings stored in NVS

## Web editor (`web/src/`)

| Folder | Responsibility |
|--------|----------------|
| `model/` | project, display presets, palettes, store (state + undo + autosave) |
| `editor/` | drawing tools |
| `templates/` | procedurally generated templates (12 eye animations) |
| `color/` | RGB565, color adjustment, dithering, color reduction |
| `render/` | the image the panel will actually show + display preview |
| `codec/` | RLE, .dpa writer/reader, unit tests, test vector generation |
| `import/` | GIF, video, resampling |
| `device/` | REST client, auto-connect, live preview |
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
