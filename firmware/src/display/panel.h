#pragma once
#include <stdint.h>

#include "config.h"

enum class ColorMode : uint8_t { Rgb565, Mono };

// Minimal display interface: the device only ever blits pre-rendered pixels, so no drawing
// primitives live here. Pixels are host-order RGB565; each panel converts to its wire format.
class Panel {
public:
  virtual ~Panel() = default;
  virtual bool begin() = 0;
  virtual const char* error() const { return nullptr; }

  virtual uint16_t width() const = 0;
  virtual uint16_t height() const = 0;
  virtual ColorMode colorMode() const = 0;

  // May return before the transfer finishes (DMA); px can be reused immediately.
  virtual void pushRect(int16_t x, int16_t y, int16_t w, int16_t h, const uint16_t* px) = 0;
  virtual void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) = 0;
  // Wait until everything is on the glass (SPI: DMA done, mono: dirty pages sent).
  virtual void flush() = 0;

  virtual void setBrightness(uint8_t level) = 0;

  // Quarter turns (0..3) without re-initialising; width()/height() follow. Mono panels only
  // support 0 and 2. Returns false when unsupported. The previous image is not preserved.
  virtual bool setRotation(uint8_t r) { return (r & 3) == rotation(); }
  virtual uint8_t rotation() const { return 0; }

  void fillScreen(uint16_t color) { fillRect(0, 0, width(), height(), color); }
};

Panel* createPanel(const DisplayConfig& cfg);

// Clip a rect to the panel. Returns false when nothing is left. Adjusts src to the first visible pixel.
inline bool clipRect(int16_t& x, int16_t& y, int16_t& w, int16_t& h, int16_t pw, int16_t ph,
                     const uint16_t** src = nullptr, int16_t* srcStride = nullptr) {
  if (srcStride) *srcStride = w;
  if (x < 0) { if (src) *src += -x; w += x; x = 0; }
  if (y < 0) { if (src) *src += (int32_t)(-y) * *srcStride; h += y; y = 0; }
  if (x + w > pw) w = pw - x;
  if (y + h > ph) h = ph - y;
  return w > 0 && h > 0;
}
