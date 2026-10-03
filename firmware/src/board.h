#pragma once
#include <stdint.h>

// Default wiring. CLK/DATA are shared between SPI (TFT) and I2C (OLED) because a board drives
// one display at a time. GPIO6/7 are the IO_MUX pins of SPI2 on both C3 and C6, so SPI can run at 80 MHz.
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
  constexpr int PIN_BUTTON = 9;  // BOOT button, active low
  constexpr int PIN_LED = 8;     // blue LED, active low
  constexpr bool LED_IS_RGB = false;
#elif defined(BOARD_C6_SUPERMINI)
  #define BOARD_NAME "ESP32-C6 SuperMini"
  #define BOARD_ID "c6"
  constexpr BoardPins kDefaultPins = {6, 7, 14, 20, 21, 22};
  constexpr int PIN_BUTTON = 9;  // BOOT button, active low
  constexpr int PIN_LED = 8;     // WS2812 RGB LED
  constexpr bool LED_IS_RGB = true;
#else
  #error "Define BOARD_C3_SUPERMINI or BOARD_C6_SUPERMINI"
#endif
