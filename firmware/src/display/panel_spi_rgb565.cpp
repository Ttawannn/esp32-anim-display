#include "panel_spi_rgb565.h"

#include <Arduino.h>
#include <driver/spi_master.h>
#include <esp_heap_caps.h>

// The ESP32's SPI2 (HSPI) has its IO_MUX pins on 14/13; SPI3 (VSPI) on 18/23, the usual TFT wiring.
#if CONFIG_IDF_TARGET_ESP32
static constexpr spi_host_device_t kHost = SPI3_HOST;
#else
static constexpr spi_host_device_t kHost = SPI2_HOST;
#endif

static constexpr uint8_t MADCTL_MY = 0x80;
static constexpr uint8_t MADCTL_MX = 0x40;
static constexpr uint8_t MADCTL_MV = 0x20;
static constexpr uint8_t MADCTL_BGR = 0x08;

static inline uint16_t swap16(uint16_t c) { return (c >> 8) | (c << 8); }

PanelSpiRgb565::PanelSpiRgb565(const DisplayConfig& cfg)
    : cfg_(cfg), preset_(kPresets[cfg.preset]) {}

PanelSpiRgb565::~PanelSpiRgb565() {
  flush();
  if (io_) esp_lcd_panel_io_del(io_);
  spi_bus_free(kHost);
  for (auto& b : bufs_) heap_caps_free(b);
}

bool IRAM_ATTR PanelSpiRgb565::onTransDone(esp_lcd_panel_io_handle_t, esp_lcd_panel_io_event_data_t*, void* ctx) {
  auto* self = static_cast<PanelSpiRgb565*>(ctx);
  self->inflight_ = self->inflight_ - 1;
  return false;
}

static constexpr uint8_t kRotation[4] = {0, MADCTL_MX | MADCTL_MV, MADCTL_MX | MADCTL_MY, MADCTL_MY | MADCTL_MV};

// Size, RAM offsets and MADCTL for a rotation. Rotations that mirror an axis measure the offset
// from the far edge of the controller RAM. `r` counts from the module's upright side; the
// controller rotation adds the preset's `turn`.
void PanelSpiRgb565::applyRotation(uint8_t r) {
  rotation_ = r & 3;
  const uint8_t ctrl = (rotation_ + preset_.turn) & 3;
  const uint16_t nativeW = (preset_.turn & 1) ? preset_.height : preset_.width;  // at controller rotation 0
  const uint16_t nativeH = (preset_.turn & 1) ? preset_.width : preset_.height;
  const bool swapAxes = ctrl & 1;
  width_ = swapAxes ? nativeH : nativeW;
  height_ = swapAxes ? nativeW : nativeH;
  const int16_t farX = preset_.ctrlW - nativeW - cfg_.offX;
  const int16_t farY = preset_.ctrlH - nativeH - cfg_.offY;
  switch (ctrl) {
    case 0: colOff_ = cfg_.offX; rowOff_ = cfg_.offY; break;
    case 1: colOff_ = cfg_.offY; rowOff_ = cfg_.offX; break;
    case 2: colOff_ = farX;      rowOff_ = farY;      break;
    case 3: colOff_ = farY;      rowOff_ = cfg_.offX; break;
  }
  if (!io_) return;
  uint8_t madctl = kRotation[ctrl];
  if (cfg_.mirrorX) madctl ^= MADCTL_MX;
  if (cfg_.bgr) madctl |= MADCTL_BGR;
  cmd(0x36, &madctl, 1);
}

bool PanelSpiRgb565::setRotation(uint8_t r) {
  if ((r & 3) == rotation_) return true;
  flush();
  applyRotation(r);
  return true;
}

bool PanelSpiRgb565::begin() {
  const BoardPins& pins = cfg_.pins;
  applyRotation(cfg_.rotation);  // size and offsets; MADCTL is sent after the init sequence

  for (auto& b : bufs_) {
    b = (uint16_t*)heap_caps_malloc(kBufPixels * 2, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    if (!b) { error_ = "out of DMA memory"; return false; }
  }

  if (pins.rst >= 0) {
    pinMode(pins.rst, OUTPUT);
    digitalWrite(pins.rst, HIGH);
    delay(5);
    digitalWrite(pins.rst, LOW);
    delay(20);
    digitalWrite(pins.rst, HIGH);
    delay(120);
  }

  spi_bus_config_t bus = {};
  bus.mosi_io_num = pins.data;
  bus.miso_io_num = -1;
  bus.sclk_io_num = pins.clk;
  bus.quadwp_io_num = -1;
  bus.quadhd_io_num = -1;
  bus.max_transfer_sz = kBufPixels * 2;
  if (spi_bus_initialize(kHost, &bus, SPI_DMA_CH_AUTO) != ESP_OK) {
    error_ = "spi_bus_initialize failed (check CLK/DATA pins)";
    return false;
  }

  esp_lcd_panel_io_spi_config_t io = {};
  io.cs_gpio_num = (gpio_num_t)pins.cs;
  io.dc_gpio_num = (gpio_num_t)pins.dc;
  io.spi_mode = cfg_.spiMode;
  io.pclk_hz = cfg_.spiHz;
  io.trans_queue_depth = 4;
  io.on_color_trans_done = &PanelSpiRgb565::onTransDone;
  io.user_ctx = this;
  io.lcd_cmd_bits = 8;
  io.lcd_param_bits = 8;
  if (esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)kHost, &io, &io_) != ESP_OK) {
    error_ = "esp_lcd_new_panel_io_spi failed (check DC/CS pins)";
    return false;
  }

  sendInit(preset_.init, preset_.initLen);

  applyRotation(cfg_.rotation);
  cmd(cfg_.invert ? 0x21 : 0x20);

  fillScreen(0x0000);
  flush();
  cmd(0x29);  // DISPON
  delay(20);

  if (pins.bl >= 0) {
    ledcAttach(pins.bl, 20000, 8);
    setBrightness(cfg_.brightness);
  }
  return true;
}

void PanelSpiRgb565::sendInit(const uint8_t* seq, size_t len) {
  size_t i = 0;
  while (i + 1 < len) {
    const uint8_t c = seq[i++];
    const uint8_t argc = seq[i] & 0x7F;
    const bool hasDelay = seq[i++] & INIT_DELAY;
    cmd(c, argc ? &seq[i] : nullptr, argc);
    i += argc;
    if (hasDelay) {
      const uint8_t ms = seq[i++];
      delay(ms == 255 ? 500 : ms);
    }
  }
}

void PanelSpiRgb565::cmd(uint8_t c, const uint8_t* data, size_t len) {
  esp_lcd_panel_io_tx_param(io_, c, data, len);
}

void PanelSpiRgb565::setWindow(int16_t x, int16_t y, int16_t w, int16_t h) {
  const uint16_t x0 = x + colOff_, x1 = x0 + w - 1;
  const uint16_t y0 = y + rowOff_, y1 = y0 + h - 1;
  const uint8_t caset[4] = {(uint8_t)(x0 >> 8), (uint8_t)x0, (uint8_t)(x1 >> 8), (uint8_t)x1};
  const uint8_t raset[4] = {(uint8_t)(y0 >> 8), (uint8_t)y0, (uint8_t)(y1 >> 8), (uint8_t)y1};
  // tx_param blocks until queued color transfers are done, which keeps window changes ordered.
  cmd(0x2A, caset, 4);
  cmd(0x2B, raset, 4);
}

// Returns the buffer not used by the most recent band. Safe to overwrite: sending that band
// waited (inside setWindow) for the band before it, which used this buffer.
uint16_t* PanelSpiRgb565::nextBuffer() {
  uint16_t* b = bufs_[nextBuf_];
  nextBuf_ ^= 1;
  return b;
}

void PanelSpiRgb565::sendBand(uint16_t* buf, int16_t x, int16_t y, int16_t w, int16_t h) {
  setWindow(x, y, w, h);
  inflight_ = inflight_ + 1;
  if (esp_lcd_panel_io_tx_color(io_, 0x2C, buf, (size_t)w * h * 2) != ESP_OK) {
    inflight_ = inflight_ - 1;
  }
}

void PanelSpiRgb565::pushRect(int16_t x, int16_t y, int16_t w, int16_t h, const uint16_t* px) {
  int16_t stride;
  if (!clipRect(x, y, w, h, width_, height_, &px, &stride)) return;
  const int16_t rowsPerBand = max<int16_t>(1, kBufPixels / w);
  for (int16_t row = 0; row < h; row += rowsPerBand) {
    const int16_t n = min<int16_t>(rowsPerBand, h - row);
    uint16_t* buf = nextBuffer();
    uint16_t* dst = buf;
    for (int16_t r = 0; r < n; r++) {
      const uint16_t* src = px + (int32_t)(row + r) * stride;
      for (int16_t c = 0; c < w; c++) *dst++ = swap16(src[c]);
    }
    sendBand(buf, x, y + row, w, n);
  }
}

void PanelSpiRgb565::fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) {
  if (!clipRect(x, y, w, h, width_, height_)) return;
  const uint16_t c = swap16(color);
  const int16_t rowsPerBand = max<int16_t>(1, kBufPixels / w);
  for (int16_t row = 0; row < h; row += rowsPerBand) {
    const int16_t n = min<int16_t>(rowsPerBand, h - row);
    uint16_t* buf = nextBuffer();
    const size_t count = (size_t)w * n;
    for (size_t i = 0; i < count; i++) buf[i] = c;
    sendBand(buf, x, y + row, w, n);
  }
}

void PanelSpiRgb565::flush() {
  while (inflight_ > 0) taskYIELD();
}

void PanelSpiRgb565::setBrightness(uint8_t level) {
  cfg_.brightness = level;
  if (cfg_.pins.bl >= 0) ledcWrite(cfg_.pins.bl, level);
}
