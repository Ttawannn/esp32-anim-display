#pragma once
#include "config.h"
class Panel {
public:
  void fillScreen(uint16_t) {}
  void flush() {}
  void setBrightness(uint8_t value) { brightness = value; }
  bool setRotation(uint8_t r) { rotation = r & 3; return true; }
  uint8_t rotation = 0;
  uint8_t brightness = 255;
};
