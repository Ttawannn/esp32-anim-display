# Firmware

Firmware for the ESP32-C3 SuperMini, ESP32-C6 SuperMini and the 30-pin ESP32 DevKit (ESP32-WROOM-32). It:
- plays `.dpa` animations created in the web editor
- serves the editor over Wi-Fi (embedded in the firmware)
- receives uploads, runs playlists, shows live previews while you edit, and lets you configure the display and Wi-Fi from the browser

Code structure: [docs/architecture.md](../docs/architecture.md). API: [docs/api.md](../docs/api.md).

## Flashing

You need [PlatformIO](https://platformio.org/) (the VS Code extension or `pip install platformio`). Build from PowerShell or VS Code; the build does not work under Git Bash.

```bash
cd firmware; python -m platformio run -e c3_supermini -t upload
```

For a C6 board, use `-e c6_supermini` instead; for a 30-pin ESP32 DevKit, `-e esp32_devkit`. The DevKit connects through a CP2102 or CH340 USB-UART chip: install its driver if no port appears.

If the upload fails: hold BOOT and press RESET (or replug USB while holding BOOT), release BOOT, then upload again.

The editor is embedded in the firmware. After changing anything in `web/`, run `npm run build:device` in `web/` before flashing.

## First-time setup

1. **Wire the display** using the table below and plug in USB.
2. **Select the display model.** The default is the 1.3" ST7789 TFT. For other displays, either:
   - serial monitor: type `presets`, then `preset <number>`
   - web UI: go to **บอร์ด** (Board) → **ตั้งค่าจอ** (Display settings)
3. **Join the board's Wi-Fi:** network `DisplayEditor-XXXX`, password `displayedit`.
   - The page opens automatically; otherwise go to http://192.168.4.1
   - Phones get the remote page: tap **ติดตั้งชุดอารมณ์** (Install mood set), then tap a face to show it
4. **Use your home Wi-Fi (optional):** go to **บอร์ด** → **Wi-Fi** → scan → enter the password → connect.
   - Afterwards, open http://display.local or the IP address shown on the display.
5. **Create an animation** and press **ส่งไปบอร์ด** (Send to board). The board starts playing it immediately.

When there are no animations yet, the display shows how to connect (Wi-Fi name, password and web address).

The editor's interface is in Thai; English translations of button names are given in parentheses.

## Button and LED

| Action | Result |
|--------|--------|
| Short press | next animation (or next playlist item) |
| Hold for 2 seconds | show connection info for 15 seconds |
| Press while "Display Editor" is shown at boot | safe mode: reset display settings to defaults |

**On-board LED:** red = booting, blue = joined home Wi-Fi, purple = running its own Wi-Fi. The C3 and the ESP32 DevKit have a single-color LED, which stays on when ready.

## Wiring

| Signal | TFT pin (SPI) | OLED pin (I2C) | C3 SuperMini | C6 SuperMini | ESP32 DevKit 30-pin |
|--------|---------------|----------------|--------------|--------------|---------------------|
| VCC | VCC | VCC | 3V3 | 3V3 | 3V3 |
| GND | GND | GND | GND | GND | GND |
| CLK | SCL / SCK / CLK | SCL | GPIO6 | GPIO6 | GPIO18 (D18) |
| DATA | SDA / MOSI / DIN | SDA | GPIO7 | GPIO7 | GPIO23 (D23) |
| CS | CS | — | GPIO10 | GPIO14 | GPIO5 (D5) |
| DC | DC / RS / A0 | — | GPIO4 | GPIO20 | GPIO16 (RX2) |
| RST | RES / RST | — | GPIO3 | GPIO21 | GPIO17 (TX2) |
| BL | BLK / BL / LED | — | GPIO5 | GPIO22 | GPIO4 (D4) |

- 1.3" ST7789 modules without a CS pin: leave CS unconnected.
- BL can go straight to 3V3, but brightness then can't be adjusted.
- Pins labeled "SCL/SDA" on TFT modules are SPI, not I2C. Connect them to CLK/DATA as in the table.
- The setup wizard shows this wiring for the chosen display, with the module's pins colored to match. Pins can be changed there, in Display settings → Wiring, or with the `pins` command.
- Usable GPIOs: C3: 0-7, 10, 20, 21. C6: 0-7, 14, 16-23. ESP32 DevKit: 4, 5, 13-19, 21-23, 25-27, 32, 33. LED, BOOT, flash, USB/serial and input-only pins are refused, as is using one pin twice.
- CLK/DATA on the defaults (GPIO6/7, or GPIO18/23 on the ESP32) allow the fastest SPI; on other pins, lower the SPI speed if the picture is garbled.
- Wrong pins and a blank screen: press BOOT while the boot screen shows (safe mode) to reset the display settings.

## Display presets

| # | id | Display |
|---|----|---------|
| 0 | `st7735s_80x160` | TFT 0.96" 80×160; rotation 0 is landscape (160×80), header on top, module text upright |
| 1 | `st7735s_80x160_b` | TFT 0.96" 80×160, alternate offset (use if the image is shifted or has a garbage edge) |
| 2 | `st7789_240x240` | TFT 1.3" 240×240 (default) |
| 3 | `gc9a01_240_round` | Round TFT 1.28" 240×240 |
| 4 | `ssd1306_128x64` | OLED 0.96" 128×64 |
| 5 | `sh1106_128x64` | OLED 1.3" 128×64 (use if SSD1306 shows a garbage strip on the left) |
| 6 | `ssd1306_128x32` | OLED 0.91" 128×32 |

## Checking the test pattern

Open it from **บอร์ด** (Board) → **ภาพทดสอบ** (Test pattern), or type `test` in the serial monitor.

| What you see | Fix with |
|--------------|----------|
| The red square is not top-left (round display: not at the top) | rotation (`rot 0..3`) |
| The image is mirrored | mirror (`mirror`) |
| Red and blue are swapped | BGR (`bgr`) |
| Colors look like a photo negative | invert (`invert`) |
| The white border is missing on some side, or there's a garbage strip at the edge | offset (`offset <x> <y>`) or a preset ending in `_b` |
| Garbled image or random dots | lower the SPI speed (`spi 27`) or I2C speed (`i2c 400`) |
| OLED reports "no OLED found" | check SDA/SCL wiring, or try `addr 3D` |

## Serial console (115200)

Type `help` for the full list.

| Group | Commands |
|-------|----------|
| Playback | `ls`, `play <name>`, `stop`, `next`, `info` |
| Wi-Fi | `wifi <ssid> <password>`, `wifi forget` |
| Display | `presets`, `preset`, `rot`, `offset`, `invert`, `bgr`, `mirror`, `spi`, `i2c`, `addr`, `pins`, `bright`, `test`, `reset` |
| Diagnostics | `show` (full status), `bench` (display and JPEG benchmarks) |

## Testing the decoder on a PC

This uses the same test files as the web side (generated by `npm test` in `web/`). Run from the repository root:

```bash
python -m ziglang c++ -std=c++17 -O1 -w -Ifirmware/src firmware/test/native/decode_test.cpp -o build/decode_test.exe
```

```bash
build/decode_test.exe shared/test-vectors
```
