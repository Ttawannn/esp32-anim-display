#pragma once
#include <Arduino.h>
#include "display/panel.h"
inline int nativePlays = 0;
class Player {
  bool active_ = false, live_ = false;
  String name_;
public:
  void begin(Panel*) {}
  bool playFile(const String& name) { nativePlays++; name_ = name; active_ = true; live_ = false; return true; }
  bool playMemory(uint8_t* data, size_t) { free(data); active_ = live_ = true; return true; }
  void setBaseRotation(uint8_t) {}
  void stop() { active_ = live_ = false; name_.clear(); }
  void tick() {}
  bool active() const { return active_; }
  bool finished() const { return false; }
  bool isLive() const { return live_; }
  const String& name() const { return name_; }
  const char* error() const { return "native"; }
  uint32_t loopsDone() const { return 0; }
  uint16_t frameIndex() const { return 0; }
  uint16_t frameCount() const { return 1; }
  float fps() const { return 10; }
};
