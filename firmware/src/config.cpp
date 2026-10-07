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
  cfg.pins = kPins;
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
    cfg.pins = kPins;  // the wiring is fixed; older firmware let it be changed
  } else {
    configDefaults(cfg);
  }
  return ok;
}

bool configSave(const DisplayConfig& cfg) {
  Preferences prefs;
  StoredConfig stored = {kVersion, cfg};
  if (!prefs.begin(kNamespace, false)) return false;
  const bool saved = prefs.putBytes(kKey, &stored, sizeof(stored)) == sizeof(stored);
  prefs.end();
  return saved;
}

void configErase() {
  Preferences prefs;
  prefs.begin(kNamespace, false);
  prefs.clear();
  prefs.end();
}
