#pragma once
#include "config.h"
class Panel {
public:
  void fillScreen(uint16_t) {}
  void flush() {}
  void setBrightness(uint8_t value) { brightness = value; }
  uint8_t brightness = 255;
};
