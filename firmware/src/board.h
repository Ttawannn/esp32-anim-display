#pragma once
#include <stddef.h>
#include <stdint.h>

// Default wiring. CLK/DATA are shared between SPI (TFT) and I2C (OLED) because a board drives
// one display at a time. They are the IO_MUX pins of the SPI bus the panel uses (GPIO6/7 for SPI2
// on C3/C6, GPIO18/23 for VSPI on the ESP32), so SPI can run at 80 MHz.
struct BoardPins {
  int8_t clk;   // SPI SCLK / I2C SCL
  int8_t data;  // SPI MOSI / I2C SDA
  int8_t cs;    // -1 = not connected
  int8_t dc;
  int8_t rst;   // -1 = not connected (tie to EN or 3V3)
  int8_t bl;    // -1 = not connected (tie to 3V3)
};

#if defined(BOARD_C3_SUPERMINI)
  #define BOARD_NAME "ESP32-C3 SuperMini"
  #define BOARD_ID "c3"
  constexpr BoardPins kDefaultPins = {6, 7, 10, 4, 3, 5};
  // Header GPIOs a display may use: not flash, USB, the BOOT button (9) or the LED (8).
  // Keep in sync with web/src/device/boards.ts.
  constexpr int8_t kUsablePins[] = {0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 21};
  constexpr int PIN_BUTTON = 9;  // BOOT button, active low
  constexpr int PIN_LED = 8;     // blue LED, active low
  constexpr bool LED_IS_RGB = false;
  constexpr bool LED_ACTIVE_LOW = true;
#elif defined(BOARD_C6_SUPERMINI)
  #define BOARD_NAME "ESP32-C6 SuperMini"
  #define BOARD_ID "c6"
  constexpr BoardPins kDefaultPins = {6, 7, 14, 20, 21, 22};
  // Not USB (12/13), the BOOT button (9), the RGB LED (8) or the status LED some boards put on 15.
  constexpr int8_t kUsablePins[] = {0, 1, 2, 3, 4, 5, 6, 7, 14, 16, 17, 18, 19, 20, 21, 22, 23};
  constexpr int PIN_BUTTON = 9;  // BOOT button, active low
  constexpr int PIN_LED = 8;     // WS2812 RGB LED
  constexpr bool LED_IS_RGB = true;
  constexpr bool LED_ACTIVE_LOW = false;
#elif defined(BOARD_ESP32_DEVKIT)
  #define BOARD_NAME "ESP32 DevKit 30-pin"
  #define BOARD_ID "esp32"
  // VSPI pins (SCK 18, MOSI 23, CS 5) plus DC 16 (RX2), RST 17 (TX2) and backlight 4.
  constexpr BoardPins kDefaultPins = {18, 23, 5, 16, 17, 4};
  // Output-capable header GPIOs. Not 1/3 (USB serial), 0 (BOOT button), 2 (LED), 12 (strapping:
  // high at reset selects 1.8 V flash), 34-39 (input only) or 6-11 (flash).
  constexpr int8_t kUsablePins[] = {4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};
  constexpr int PIN_BUTTON = 0;  // BOOT button, active low
  constexpr int PIN_LED = 2;     // blue LED, active high
  constexpr bool LED_IS_RGB = false;
  constexpr bool LED_ACTIVE_LOW = false;
#else
  #error "Define BOARD_C3_SUPERMINI, BOARD_C6_SUPERMINI or BOARD_ESP32_DEVKIT"
#endif

// Checks a wiring before it is saved: CLK/DATA must be connected, every pin must be one of
// kUsablePins (-1 = not connected) and no pin may be used twice. Returns an API error or nullptr.
inline const char* boardPinsError(const BoardPins& p) {
  const int8_t all[] = {p.clk, p.data, p.cs, p.dc, p.rst, p.bl};
  if (p.clk < 0 || p.data < 0) return "invalid pin";
  for (size_t i = 0; i < sizeof(all); i++) {
    if (all[i] < 0) continue;
    bool usable = false;
    for (int8_t u : kUsablePins) usable |= u == all[i];
    if (!usable) return "invalid pin";
    for (size_t j = 0; j < i; j++)
      if (all[j] == all[i]) return "pin used twice";
  }
  return nullptr;
}
