# esp32-anim-display — Project plan

An ESP32-C3 / ESP32-C6 drives a small display that plays animations (pixel art, GIFs, video). Animations are created, edited and uploaded from a web app over Wi-Fi.
A single firmware supports every display; the display model is chosen from the web UI **without recompiling**.

> **Status (2026-10-03):** every part is implemented and the firmware builds for both C3 and C6, **but nothing has been tested on real boards and displays yet.**
> - ✅ Phase 0: display drivers, test pattern, benchmarks
> - ✅ Phase 1: `.dpa` player (INDEXED / JPEG / MONO, delta rects, scaling); the C++ decoder matches the JS encoder pixel for pixel (native test)
> - ✅ Phase 2: Wi-Fi (STA + AP + captive portal + mDNS), REST API ([docs/api.md](docs/api.md)), uploads, editor embedded in the firmware
> - ✅ Phases 3–4: full editor, eye templates, live preview on the board, board manager
> - ✅ Phase 5: playlist, BOOT button, resume the last animation after reboot
> - ⏳ Remaining: testing on real hardware, OTA (optional), items under "Not yet implemented"

---

## 1. Scope

| In scope | Out of scope (v1) |
|----------|-------------------|
| Looping animations / playlists | live-data widgets (clock, sensors, MQTT) |
| Pixel art editor in the browser | advanced video editing (audio, transitions) |
| Ready-made GIF upload | multiple displays on one board |
| Video upload (MP4/WebM/MOV), converted in the browser | |
| Color editing (color displays), black-and-white conversion/dithering (OLED) | |

## 2. Hardware

### Boards: ESP32-C3 SuperMini and ESP32-C6 SuperMini
| | ESP32-C3 SuperMini | ESP32-C6 SuperMini |
|--|--------------------|--------------------|
| CPU | RISC-V, 1 core, 160 MHz | RISC-V, 1 core, 160 MHz |
| SRAM | 400 KB | 512 KB |
| PSRAM | none | none |
| Flash | 4 MB | 4 MB (most boards; check with `esptool flash_id`) |
| USB | native USB (CDC) | native USB (CDC) |
| BOOT button | GPIO9 | GPIO9 |
| On-board LED | GPIO8 (blue) | GPIO8 (RGB WS2812) |

Design consequences:
- **No PSRAM, so no full frame in RAM (240×240×2 = 115 KB).** The firmware decodes in bands and sends them to the display over DMA immediately, using roughly 2 × 7.5 KB of buffers.
- **Single core:** Wi-Fi and playback share the CPU.
- **Limited storage (about 2 MB of the 4 MB flash):** files must compress well, and the web UI shows the remaining space before uploading.
- **BOOT button (GPIO9):** present on both boards; used to switch animations.
- **Safe mode:** press BOOT **while the boot screen is shown**. Holding it from power-on doesn't work: GPIO9 is a strapping pin, so the board would enter firmware-download mode instead.
- **On-board LED (GPIO8):** shows status (C6 in color).

### Supported displays
| Preset | Controller | Resolution | Bus | Color | Notes |
|--------|------------|------------|-----|-------|-------|
| TFT 0.96" | ST7735S | 80×160 | SPI | RGB565 | IPS; needs offset (26,1), invert, BGR |
| TFT 1.3" | ST7789 | 240×240 | SPI | RGB565 | many modules have no CS pin and need SPI mode 3 |
| Round TFT 1.28" | GC9A01 | 240×240 | SPI | RGB565 | the editor shows a round mask |
| OLED 0.96" | SSD1306 | 128×64 | I2C | mono | 1.3" modules usually use the SH1106 (has its own preset) |
| OLED 0.91" | SSD1306 | 128×32 | I2C | mono | |

> The original request listed "oled 128x64 gc9a01", but the GC9A01 is the round TFT's controller, so this plan assumes the 128×64 OLED uses an SSD1306 or SH1106.

### Pin assignment (defaults, changeable from the web UI)
Idea: **one wiring harness for every display.** CLK and DATA are shared between SPI (TFT) and I2C (OLED), because a board drives one display at a time.
GPIO6/7 are SPI2's IO_MUX pins on both the C3 and the C6 (bypassing the GPIO matrix), so SPI can run at up to 80 MHz.

| Signal | TFT pin (SPI) | OLED pin (I2C) | C3 SuperMini | C6 SuperMini |
|--------|---------------|----------------|--------------|--------------|
| VCC | VCC | VCC | 3V3 | 3V3 |
| GND | GND | GND | GND | GND |
| CLK | SCL / SCK / CLK | SCL | **GPIO6** | **GPIO6** |
| DATA | SDA / MOSI / DIN | SDA | **GPIO7** | **GPIO7** |
| CS | CS | — | GPIO10 | GPIO14 |
| DC | DC / RS / A0 | — | GPIO4 | GPIO20 |
| RST | RES / RST | — | GPIO3 | GPIO21 |
| BL | BLK / BL / LED | — | GPIO5 (PWM) | GPIO22 (PWM) |

Pins to avoid:
- **C3:** GPIO2, 8, 9 (strapping), GPIO18, 19 (USB)
- **C6:** GPIO4, 5, 8, 9, 15 (strapping), GPIO12, 13 (USB), GPIO16, 17 (UART0)
- GPIO6/7 on the C6 are also JTAG pins, but they work as SPI because USB debugging uses the internal USB-JTAG.

Wiring notes:
- **1.3" ST7789 without a CS pin:** leave CS unconnected (the preset already uses SPI mode 3).
- **BL:** connect directly to 3V3 if brightness control isn't needed.
- **I2C OLED:** most modules already have pull-up resistors; only 4 wires are needed.

## 3. Architecture

```
┌──────────────────────────── Browser (PC / phone) ────────────────────────────┐
│ Web editor                                                                   │
│  Pixel editor │ Eye templates │ GIF/video import │ Color tools │ Board manager │
│        └──────────── encoder → .dpa file ────────────┘                        │
└───────────────────────────────────┬──────────────────────────────────────────┘
          HTTP REST: upload, file management, playlist, settings, live preview
┌───────────────────────────────────┴──────────────────────────────────────────┐
│ ESP32-C3/C6 firmware                                                          │
│  AsyncWebServer → LittleFS → player (streamed decode) → esp_lcd + DMA → panel  │
│  Wi-Fi (AP/STA/mDNS) · BOOT button · playlist                                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Principle: the heavy work happens in the browser:** GIF/video decoding, resizing, color adjustment, color reduction, dithering and compression.
The ESP32 only decodes `.dpa` files that are already sized for its display and pushes them to the panel. Details: [docs/architecture.md](docs/architecture.md).

## 4. The `.dpa` file format (Display Animation)

Full specification: [docs/dpa-format.md](docs/dpa-format.md).

| Frame type | Used for | Storage |
|------------|----------|---------|
| `MONO` | OLED | 1 bit/pixel in OLED page layout + RLE, delta rects |
| `INDEXED` | pixel art, GIF | palette + delta rect + RLE (lossless) |
| `JPEG` | video, photos | one baseline JPEG per frame, decoded with JPEGDEC |

- **`scale`** is for pixel art: art is stored at its real resolution (e.g. 60×60) and the board upscales it ×4 to 240×240 with nearest-neighbor while playing, making files about 16× smaller.
- If a file doesn't match the display size (e.g. after swapping displays), the board plays it centered and the web UI shows a warning.

### What fits in about 2 MB
| Content | Approx. size per frame | Fits in ~2 MB |
|---------|------------------------|---------------|
| OLED 128×64 | 0.1–0.5 KB | thousands of frames |
| Pixel art 60×60 ×4 | 0.1–2 KB | thousands of frames |
| GIF 240×240 | 3–20 KB | 100–600 frames |
| Video 240×240 JPEG q≈70 | 8–12 KB | about 10 seconds at 20 fps |
| Video 80×160 | 3–5 KB | about 25 seconds at 20 fps |

## 5. Firmware

### Tools and libraries
- **PlatformIO + pioarduino platform (Arduino core 3.x / ESP-IDF 5.x).** The official PlatformIO platform does not support the C6 with Arduino.
- **ESP-IDF `esp_lcd` panel IO** for SPI displays: it ships with the core, is maintained by Espressif, and supports both C3 and C6. It handles SPI + DMA + the DC pin; we only write each display's init sequence.
  - Why not LovyanGFX: it doesn't officially list the C6, and the board only draws bitmaps, so a full graphics library isn't needed.
  - Fallback if problems appear: Arduino_GFX (has working C6 examples).
- **Arduino `Wire`** for I2C OLEDs. It is simpler than `esp_lcd` I2C and doesn't conflict with the core's I2C driver.
- **JPEGDEC** (bitbank2) decodes JPEG one MCU block at a time and sends it straight to the display.
- **ESP32Async/ESPAsyncWebServer + AsyncTCP**, **ArduinoJson**, **LittleFS**.
- A built-in 5×7 font for the IP/status/test screens.

### Display drivers
Two driver types cover every display:
| Driver | Displays | Work |
|--------|----------|------|
| `PanelSpiRgb565` | ST7735S, ST7789, GC9A01 | init sequence → `CASET/RASET/RAMWR` → pixels over DMA, double-buffered bands |
| `PanelI2cMono` | SSD1306 (128×64, 128×32), SH1106 | init sequence → page-by-page writes (8 rows), SH1106 column offset, dirty pages only |

Presets (geometry, offsets, flags, init sequence) are compiled into `display/presets.cpp` and selected at runtime. All tuning values (rotation, offset, invert, BGR, mirror, bus speed, pins) are stored in NVS.

### Partitions
Both boards have 4 MB of flash and use the same layouts:
- **Default (storage-first):** `nvs | app 1.75 MB | littlefs ~2.1 MB`. Firmware updates over USB.
- **OTA option:** `app0 1.5 MB | app1 1.5 MB | littlefs ~0.9 MB`. The measured firmware size (about 1.4 MB including the editor) fits, at the cost of animation storage.

### Performance targets
| Case | Target fps |
|------|------------|
| I2C OLED 128×64 (I2C 800 kHz–1 MHz) | 30+ |
| Pixel art / GIF 240×240 (SPI 40–80 MHz, delta) | 30+ with partial changes, 20+ for full-screen changes |
| JPEG video 240×240 on C3/C6 | 15–20 (JPEG decoding is the bottleneck) |
| Video 80×160 | 30 |

These targets still need to be measured on hardware (`bench` command).

## 6. Web app

### Technology
- **Vite + Preact + TypeScript.** The compressed editor assets total about 57 KB (budget: 150 KB), embedded in the firmware.
- `gifuct-js` decodes GIFs. Video uses the browser's `<video>` element + canvas (no heavy ffmpeg.wasm).
- The ESP32 serves the editor itself, so it also works in AP mode without internet. During development, `vite dev` proxies the API to a board or to the mock board.

### What was built
- **Pixel art editor:** drawing tools, frames, onion skin, delays, palette presets, replace a color across all frames, undo/redo, autosave, `.dpe` project files.
- **Eye templates:** 12 moods × 3 styles.
- **GIF and video import:** fit/crop/zoom/pan, trimming, speed or fps, resolution, size estimate.
- **Color tools (TFT):** brightness, contrast, saturation, hue, invert, color limit.
- **Black and white (OLED):** threshold, dithering (none / Floyd–Steinberg / Atkinson / Bayer), invert.
- **True-to-hardware display preview**, including round displays and OLED tint.
- **Export:** `.dpa` with a size estimate, upload to the board, live preview on the board.
- **Encoding:** Web Worker and a bounded cache shared by estimates, downloads, uploads and live preview.
- **Cancellation and budgets:** unused estimates are cancelled; GIF decoding runs in a Worker; GIF/video imports enforce decoded-frame memory and count limits.
- **USB:** Web Serial connection controls, complete-operation sequencing, upload progress and storage confirmation.
- **Board manager:** board name (sets the `.local` address), files (play/delete, storage), playlist (drag to reorder, time per item), display settings (preset, rotation, offset, invert, BGR, mirror, bus speed, pins, brightness, test pattern), Wi-Fi (scan, connect, forget).
- **Firmware version check:** the editor knows the firmware version it was built with and warns, with a link to the online installer, when a connected board runs older firmware.
- **Remote:** board name in the header, auto-cycle with a chosen time per page (5 s to 1 min, or play once).

### Not yet implemented
- Animated thumbnails in the board's file list.
- Backup/restore of animations.
- Loading extra display presets from a JSON file on the board.
- OTA firmware updates.

## 7. Project structure

```
esp32-anim-display/
├─ firmware/
│  ├─ platformio.ini          # envs: c3_supermini, c6_supermini
│  ├─ partitions/             # 4mb_storage.csv, 4mb_ota.csv
│  ├─ src/{app,display,player,net,storage,bench}/ + main.cpp
│  └─ test/native/            # C++ decoder test against the shared vectors
├─ web/
│  ├─ src/{model,editor,templates,color,render,codec,import,device,storage,ui}/
│  └─ scripts/                # embed.mjs (editor → firmware), mock-board.mjs
├─ shared/test-vectors/       # files the JS encoder and C++ decoder must agree on
└─ docs/                      # architecture, .dpa format, API
```

## 8. Development phases

### Phase 0: hardware bring-up ✅ (code), ⏳ (hardware)
- PlatformIO (pioarduino) envs `c3_supermini` and `c6_supermini`.
- Drivers on `esp_lcd` (SPI) and `Wire` (I2C) with a test pattern for all 5 displays.
- **Still to measure on hardware:**
  - the highest SPI clock that stays clean (start at 40 MHz, go up to 80 MHz)
  - the highest I2C clock
  - JPEG 240×240 decode time
  - free heap with Wi-Fi + web server running
- Building on Windows must be done from PowerShell / VS Code, not Git Bash (the ESP-IDF tools installer doesn't support MSys).

### Phase 1: player + `.dpa` ✅
- `.dpa` spec, MONO / INDEXED / JPEG decoders, scaling, banded output over DMA.
- Runtime display config, safe mode.

### Phase 2: Wi-Fi + API ✅
- Wi-Fi AP/STA/mDNS, captive portal, REST API, uploads via temp file + validate + rename.

### Phase 3: pixel art editor ✅
Built before phases 1–2 so the editor could be tried early.

### Phase 4: video + color tools ✅

### Phase 5: polish ✅ (except OTA)
- Playlist, BOOT button to switch animations, resume the last animation after reboot.

## 9. Testing
- **Codec:** Vitest (JS) + a native C++ test using the same `shared/test-vectors`; results must match exactly. ✅
- **Board API:** the editor was tested against `web/scripts/mock-board.mjs`. ✅
- **Failure paths:** native queue/receipts, partial writes, file recovery, interrupted-upload cleanup, Stop during overlays, and failed brightness saves; web cancellation, cache invalidation and confirmed settings saves. ✅
- **CI:** GitHub Actions checks web/native tests and both firmware builds with pinned dependencies. ✅ (workflow added; hosted run occurs after push)
- **Displays:** check each preset's test pattern for offset, rotation and color order (RGB/BGR, invert). ⏳
- **Performance:** fps, heap and free space are reported by `/api/info` and the `bench` command. ⏳
- **Robustness:** large uploads, Wi-Fi dropping mid-upload, full storage. ⏳

## 10. Risks
| Risk | Mitigation |
|------|------------|
| Display libraries with incomplete C6 support | use Espressif's own `esp_lcd`; fallback is Arduino_GFX |
| Clone displays whose init sequences differ from the reference | init sequences live in presets; alternate presets exist (e.g. ST7735 offset variants, SH1106) |
| Not enough RAM (no PSRAM) | banded decoding, no full frame buffer |
| 240×240 video uses a lot of storage | size shown before upload, fps/quality suggestions, INDEXED instead of JPEG for cartoon clips |
| Slow JPEG decoding on the C3 | measure in phase 0; prefer INDEXED for cartoon clips |
| Wi-Fi competing with the player for the single core | AsyncTCP runs in its own task; uploads are written by the network task, drawing stays in the loop task |
| Wrong display settings leave the screen blank | the web UI works without the display; press BOOT on the boot screen for safe mode |
