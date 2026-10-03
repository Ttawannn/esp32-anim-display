#pragma once
#include <stdint.h>

#include "display/panel.h"

struct BenchResults {
  bool ran = false;
  float fillFps = 0;      // full-screen solid fills: raw bus throughput
  float fillKBps = 0;
  float plasmaFps = 0;    // full-screen CPU render + push
  float jpegDecodeMs = 0; // 240x240 JPEG, decode only
  float jpegDrawMs = 0;   // decode + push to panel
};

extern BenchResults gBench;

void benchRun(Panel& p);
void benchPrint();
