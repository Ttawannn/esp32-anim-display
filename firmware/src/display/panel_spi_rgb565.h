#pragma once
#include <esp_lcd_panel_io.h>

#include "panel.h"

// ST7735 / ST7789 / GC9A01 over SPI using ESP-IDF esp_lcd panel IO (DMA, DC pin handling).
// Pixels are sent in bands through two DMA buffers: while one band is on the wire, the CPU
// fills the other.
class PanelSpiRgb565 : public Panel {
public:
  explicit PanelSpiRgb565(const DisplayConfig& cfg);
  ~PanelSpiRgb565() override;

  bool begin() override;
  const char* error() const override { return error_; }
  uint16_t width() const override { return width_; }
  uint16_t height() const override { return height_; }
  ColorMode colorMode() const override { return ColorMode::Rgb565; }

  void pushRect(int16_t x, int16_t y, int16_t w, int16_t h, const uint16_t* px) override;
  void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) override;
  void flush() override;
  void setBrightness(uint8_t level) override;

private:
  static constexpr size_t kBufPixels = 240 * 24;

  void sendInit(const uint8_t* seq, size_t len);
  void cmd(uint8_t c, const uint8_t* data = nullptr, size_t len = 0);
  void setWindow(int16_t x, int16_t y, int16_t w, int16_t h);
  uint16_t* nextBuffer();
  void sendBand(uint16_t* buf, int16_t x, int16_t y, int16_t w, int16_t h);
  static bool onTransDone(esp_lcd_panel_io_handle_t io, esp_lcd_panel_io_event_data_t* e, void* ctx);

  DisplayConfig cfg_;
  const Preset& preset_;
  uint16_t width_ = 0, height_ = 0;
  int16_t colOff_ = 0, rowOff_ = 0;
  esp_lcd_panel_io_handle_t io_ = nullptr;
  uint16_t* bufs_[2] = {nullptr, nullptr};
  uint8_t nextBuf_ = 0;
  // Incremented only after setWindow() has waited for all earlier bands, so it never races the ISR.
  volatile int inflight_ = 0;
  const char* error_ = nullptr;
};
