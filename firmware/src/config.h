#pragma once
#include <stdint.h>

#include "board.h"
#include "display/presets.h"

// Active display settings, persisted in NVS. Starts from a preset; every field can be overridden
// (serial console now, web UI later) to cope with clone modules that differ from the preset.
struct DisplayConfig {
  uint8_t preset;
  uint8_t rotation;  // 0..3 (mono panels: 0 or 2)
  int16_t offX, offY;
  bool invert, bgr, mirrorX;
  uint8_t spiMode;
  uint32_t spiHz;
  uint32_t i2cHz;
  uint8_t i2cAddr;
  uint8_t brightness;  // backlight PWM (TFT) or contrast (OLED)
  BoardPins pins;
};

void configApplyPreset(DisplayConfig& cfg, uint8_t presetIndex);  // keeps pins
void configDefaults(DisplayConfig& cfg);
bool configLoad(DisplayConfig& cfg);   // false = nothing stored, defaults used
bool configSave(const DisplayConfig& cfg);
void configErase();
