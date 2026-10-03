#include "config.h"

#include <Preferences.h>

static constexpr const char* kNamespace = "display";
static constexpr const char* kKey = "cfg";
static constexpr uint8_t kVersion = 1;

struct StoredConfig {
  uint8_t version;
  DisplayConfig cfg;
};

void configApplyPreset(DisplayConfig& cfg, uint8_t presetIndex) {
  if (presetIndex >= kPresetCount) presetIndex = 0;
  const Preset& p = kPresets[presetIndex];
  cfg.preset = presetIndex;
  cfg.rotation = 0;
  cfg.offX = p.offX;
  cfg.offY = p.offY;
  cfg.invert = p.invert;
  cfg.bgr = p.bgr;
  cfg.mirrorX = p.mirrorX;
  cfg.spiMode = p.spiMode;
  cfg.spiHz = p.spiHz;
  cfg.i2cHz = p.i2cHz;
  cfg.i2cAddr = p.i2cAddr;
}

void configDefaults(DisplayConfig& cfg) {
  cfg = {};
  cfg.pins = kDefaultPins;
  cfg.brightness = 255;
  configApplyPreset(cfg, (uint8_t)findPreset("st7789_240x240"));
}

bool configLoad(DisplayConfig& cfg) {
  Preferences prefs;
  StoredConfig stored;
  bool ok = prefs.begin(kNamespace, true) &&
            prefs.getBytesLength(kKey) == sizeof(stored) &&
            prefs.getBytes(kKey, &stored, sizeof(stored)) == sizeof(stored) &&
            stored.version == kVersion && stored.cfg.preset < kPresetCount;
  prefs.end();
  if (ok) {
    cfg = stored.cfg;
  } else {
    configDefaults(cfg);
  }
  return ok;
}

void configSave(const DisplayConfig& cfg) {
  Preferences prefs;
  StoredConfig stored = {kVersion, cfg};
  prefs.begin(kNamespace, false);
  prefs.putBytes(kKey, &stored, sizeof(stored));
  prefs.end();
}

void configErase() {
  Preferences prefs;
  prefs.begin(kNamespace, false);
  prefs.clear();
  prefs.end();
}
