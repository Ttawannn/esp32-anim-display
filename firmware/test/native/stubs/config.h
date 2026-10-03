#pragma once
#include <Arduino.h>
struct DisplayConfig { uint8_t preset = 0, brightness = 255; };
struct Preset { const char* id; bool round; };
inline Preset kPresets[] = {{"native", false}};
inline bool nativeConfigSave = true;
inline bool configSave(const DisplayConfig&) { return nativeConfigSave; }
