#pragma once
#include "panel.h"

// SSD1306 / SH1106 over I2C. Keeps a 1-bit framebuffer in RAM (page layout: 8 vertical pixels
// per byte) and sends only the pages touched since the last flush().
class PanelI2cMono : public Panel {
public:
  explicit PanelI2cMono(const DisplayConfig& cfg);
  ~PanelI2cMono() override;

  bool begin() override;
  const char* error() const override { return error_; }
  uint16_t width() const override { return width_; }
  uint16_t height() const override { return height_; }
  ColorMode colorMode() const override { return ColorMode::Mono; }

  void pushRect(int16_t x, int16_t y, int16_t w, int16_t h, const uint16_t* px) override;
  void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) override;
  void flush() override;
  void setBrightness(uint8_t level) override;

  // Direct access for the player: page-layout bits, then markDirty() + flush().
  uint8_t* framebuffer() { return fb_; }
  void markDirty(uint8_t pageMask) { dirty_ |= pageMask; }
  void markAllDirty() { dirty_ = (1u << pages_) - 1; }
  uint8_t i2cAddress() const { return addr_; }

private:
  static constexpr size_t kChunk = 64;  // data bytes per I2C transaction (Wire buffer is 128)

  bool probe(uint8_t addr);
  void sendInit(const uint8_t* seq, size_t len);
  void commands(const uint8_t* c, size_t len);
  void command(uint8_t c) { commands(&c, 1); }
  inline void setPixel(int16_t x, int16_t y, bool on) {
    uint8_t& b = fb_[(y >> 3) * width_ + x];
    const uint8_t bit = 1u << (y & 7);
    b = on ? (b | bit) : (b & ~bit);
  }

  DisplayConfig cfg_;
  const Preset& preset_;
  uint16_t width_ = 0, height_ = 0;
  uint8_t pages_ = 0;
  uint8_t addr_ = 0;
  uint8_t* fb_ = nullptr;
  uint8_t dirty_ = 0;
  const char* error_ = nullptr;
};

// Perceived brightness of an RGB565 color, 0..255.
inline uint8_t luma565(uint16_t c) {
  const uint8_t r = (c >> 11) << 3, g = ((c >> 5) & 0x3F) << 2, b = (c & 0x1F) << 3;
  return (r * 77 + g * 150 + b * 29) >> 8;
}
