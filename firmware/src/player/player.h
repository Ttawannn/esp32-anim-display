#pragma once
#include <Arduino.h>
#include <JPEGDEC.h>

#include <memory>

#include "display/panel.h"
#include "dpa.h"
#include "source.h"
#include "widgets.h"

// Plays DPA animations onto a Panel, streaming frames from flash (no full frame buffer needed).
// Single-threaded: call everything from the loop task.
class Player {
public:
  ~Player();
  void begin(Panel* panel);

  bool playFile(const String& name);          // /anims/<name>.dpa
  bool playMemory(uint8_t* data, size_t len); // takes ownership of a malloc'd buffer (live preview)
  // Panel rotation for screens that are not animations (info, test pattern); files set their own.
  void setBaseRotation(uint8_t r) { baseRotation_ = r & 3; }
  void stop();
  void tick();

  bool active() const { return src_ != nullptr; }
  // True once a finite loop count has completed (the last frame stays on screen).
  bool finished() const { return finished_; }
  uint32_t loopsDone() const { return loops_; }
  const String& name() const { return name_; }
  bool isLive() const { return live_; }
  const char* error() const { return error_; }
  uint16_t frameIndex() const { return frame_; }
  uint16_t frameCount() const { return h_.frameCount; }
  float fps() const { return fps_; }

private:
  bool open(std::unique_ptr<Source> src);
  bool drawFrame(uint16_t i);
  bool drawIndexed(const dpa::FrameEntry& e);
  bool drawMono(const dpa::FrameEntry& e);
  bool drawJpeg(const dpa::FrameEntry& e);
  bool readRect(const dpa::FrameEntry& e, uint16_t r[4]);
  static int jpegDraw(JPEGDRAW* d);
  // Clock widgets blended into colour output, or drawn into the OLED framebuffer after a frame.
  const dpa::Widgets* overlay() const { return colorOverlay_ ? &widgets_ : nullptr; }
  void drawMonoWidgets();
  bool show(uint16_t i);

  Panel* panel_ = nullptr;
  std::unique_ptr<Source> src_;
  dpa::Header h_{};
  dpa::FrameEntry* table_ = nullptr;
  uint16_t palette_[256];
  int16_t baseX_ = 0, baseY_ = 0;  // screen position of canvas (0,0)

  uint8_t* row_ = nullptr;     // one decoded canvas row (indices or page bytes)
  uint16_t* rowPx_ = nullptr;  // the same row as RGB565
  uint16_t* band_ = nullptr;   // screen pixels waiting for pushRect
  size_t bandPixels_ = 0;

  dpa::Widgets widgets_;
  bool colorOverlay_ = false;
  uint32_t clockAt_ = 0;
  int32_t shown_ = -1;  // frame currently on the panel
  uint8_t baseRotation_ = 0;

  JPEGDEC* jpeg_ = nullptr;
  uint8_t* jpegBuf_ = nullptr;
  size_t jpegBufSize_ = 0;
  uint16_t jpegRect_[4];

  String name_;
  bool live_ = false;
  uint16_t frame_ = 0;
  uint32_t nextAt_ = 0;
  uint32_t loops_ = 0;
  bool finished_ = false;
  const char* error_ = nullptr;
  float fps_ = 0;
  uint32_t fpsWindow_ = 0, fpsFrames_ = 0;
};
