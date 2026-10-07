#pragma once
#include <stdint.h>

// Fixed wiring, one per board (the web wiring guide shows the same table: web/src/device/boards.ts).
// CLK/DATA are shared between SPI (TFT) and I2C (OLED) because a board drives
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
  constexpr BoardPins kPins = {6, 7, 10, 4, 3, 5};
  constexpr int PIN_BUTTON = 9;  // BOOT button, active low
  constexpr int PIN_LED = 8;     // blue LED, active low
  constexpr bool LED_IS_RGB = false;
  constexpr bool LED_ACTIVE_LOW = true;
#elif defined(BOARD_C6_SUPERMINI)
  #define BOARD_NAME "ESP32-C6 SuperMini"
  #define BOARD_ID "c6"
  constexpr BoardPins kPins = {6, 7, 14, 20, 21, 22};
  constexpr int PIN_BUTTON = 9;  // BOOT button, active low
  constexpr int PIN_LED = 8;     // WS2812 RGB LED
  constexpr bool LED_IS_RGB = true;
  constexpr bool LED_ACTIVE_LOW = false;
#elif defined(BOARD_ESP32_DEVKIT)
  #define BOARD_NAME "ESP32 DevKit 30-pin"
  #define BOARD_ID "esp32"
  // VSPI pins (SCK 18, MOSI 23, CS 5) plus DC 16 (RX2), RST 17 (TX2) and backlight 4.
  constexpr BoardPins kPins = {18, 23, 5, 16, 17, 4};
  constexpr int PIN_BUTTON = 0;  // BOOT button, active low
  constexpr int PIN_LED = 2;     // blue LED, active high
  constexpr bool LED_IS_RGB = false;
  constexpr bool LED_ACTIVE_LOW = false;
#else
  #error "Define BOARD_C3_SUPERMINI, BOARD_C6_SUPERMINI or BOARD_ESP32_DEVKIT"
#endif

