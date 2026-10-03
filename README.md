# esp32-anim-display

**Create animations in your browser and play them on small TFT/OLED displays driven by an ESP32-C3 / ESP32-C6, over Wi-Fi.**

Draw pixel art, generate expressive robot eyes, or import GIFs and videos. Then send them to the board with one click.

**[Open the editor online](https://ttawannn.github.io/esp32-anim-display/)** · **[Install the firmware from your browser](https://ttawannn.github.io/esp32-anim-display/flash/)** (Chrome / Edge, USB)

<p align="center">
  <img src="docs/images/eyes-demo.gif" alt="Eye template demo: look left-right, happy, angry, in love, surprised" width="240">
</p>

## Features

- **Built-in web editor:** the board serves the editor itself. Nothing to install, and it works on desktop and mobile.
- **Phone remote:** phones open a remote page with a thumbnail for every animation on the board; tap one to show it. It also has next/stop, brightness, auto-cycle, and a one-tap install of all 12 eye moods.
- **Pixel art editor:** drawing tools, frames, onion skin, palette presets, undo/redo.
- **Eye templates:** 12 moods in 3 styles (robot, cartoon, single eye for round displays). Color, size and smoothness are adjustable.
- **GIF and video import:** trim, crop and choose the frame rate. All conversion happens in the browser.
- **Color tools:** brightness, contrast, saturation, hue and color count. OLEDs get 1-bit conversion with dithering.
- **True-to-hardware preview:** RGB565 or 1-bit color and the round-display mask. Switch the target display at any time.
- **One-click upload:** with live preview on the real display while you edit.
- **USB connection:** manage the board and upload directly over Web Serial, with progress and confirmation that files were saved.
- **Board management from the browser:** files, playlist, display settings and Wi-Fi.
- **Compact files:** the [.dpa format](docs/dpa-format.md) stores only what changes between frames. The look-left-right animation on a 240×240 display takes just 24 KB.

<p align="center">
  <img src="docs/images/eye-moods.png" alt="Eye templates: 12 moods in 3 styles" width="540">
</p>

## Supported hardware

| Boards | Displays |
|--------|----------|
| ESP32-C3 SuperMini | TFT 0.96" ST7735S 80×160 |
| ESP32-C6 SuperMini | TFT 1.3" ST7789 240×240 |
| | Round TFT 1.28" GC9A01 240×240 |
| | OLED 0.96" SSD1306 / 1.3" SH1106 128×64 |
| | OLED 0.91" SSD1306 128×32 |

The display model is selected from the web UI at runtime, so changing it needs no recompile. For wiring, see [firmware/README.md](firmware/README.md).

## Getting started

1. **Flash the firmware.** Either:
   - **From the browser (easiest):** plug the board in over USB, open the [firmware installer](https://ttawannn.github.io/esp32-anim-display/flash/) in Chrome or Edge, and press **ติดตั้งเฟิร์มแวร์** (Install firmware). The C3 or C6 is detected automatically.
   - **With [PlatformIO](https://platformio.org/):** run this from PowerShell or VS Code (the build does not work under Git Bash):

     ```bash
     cd firmware; python -m platformio run -e c3_supermini -t upload
     ```

     For a C6 board, use `-e c6_supermini`.

2. **Join the board's Wi-Fi.** The network is `DisplayEditor-XXXX` and the password is `displayedit`. The page opens automatically, or go to http://192.168.4.1.
   - **On a phone:** the remote opens. Tap **ติดตั้งชุดอารมณ์** (Install mood set) to load all 12 eye moods, then tap any face to show it.
   - **On a computer:** the editor opens. On a phone, use **เปิด Editor** (Open editor); on a computer, use the **รีโมท** (Remote) button to switch.
3. **Pick your display.** The editor's interface is in Thai: click the connection chip in the top bar → **จัดการบอร์ด** (Board manager) → **ตั้งค่าจอ** (Display settings), choose the model, then press **ภาพทดสอบ** (Test pattern) to check orientation and colors.
4. **Make an animation**, for example **แม่แบบดวงตา** (Eye templates) → create, then press **ส่งไปบอร์ด** (Send to board).

To use your home network instead, go to **จัดการบอร์ด** → **Wi-Fi**. After that, the board is reachable at http://display.local.

**Using the online editor:** browsers block an HTTPS site from talking to a plain-HTTP board over Wi-Fi, so the [online editor](https://ttawannn.github.io/esp32-anim-display/) connects over USB instead: connection chip → **ผ่านสาย USB** (Over USB). Everything else (sending, live preview, the remote, board settings) works the same.

**BOOT button on the board:**
- Short press: next animation.
- Hold for 2 seconds: show the Wi-Fi name and IP address on the display.

### Try it without a board

A mock board implements the same API as the firmware. Install the dependencies once:

```bash
cd web; npm install
```

Then run each of these in its own terminal:

```bash
cd web; npm run mock-board
```

```bash
cd web; npm run dev:mock
```

Then open http://localhost:5173.

## Repository layout

| Path | Contents |
|------|----------|
| [`firmware/`](firmware/README.md) | ESP32 firmware (PlatformIO + Arduino 3.x): player, storage, Wi-Fi, REST API, embedded editor |
| [`web/`](web/README.md) | Web editor (Vite + Preact + TypeScript) |
| [`docs/`](docs/architecture.md) | [Architecture](docs/architecture.md) · [.dpa file format](docs/dpa-format.md) · [REST API](docs/api.md) |
| `shared/test-vectors/` | Test files that the TypeScript encoder and the C++ decoder must agree on, pixel for pixel |

## Status

All parts are implemented and the firmware builds for both ESP32-C3 and ESP32-C6. So far it has been verified with:
- web unit tests
- a native (PC) test of the C++ decoder
- the mock board

**It has not yet been tested on real boards and displays.** See [PLAN.md](PLAN.md) for the roadmap.
