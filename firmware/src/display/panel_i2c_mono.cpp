#include "panel_i2c_mono.h"

#include <Arduino.h>
#include <Wire.h>

PanelI2cMono::PanelI2cMono(const DisplayConfig& cfg) : cfg_(cfg), preset_(kPresets[cfg.preset]) {}

PanelI2cMono::~PanelI2cMono() {
  Wire.end();
  free(fb_);
}

bool PanelI2cMono::probe(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

bool PanelI2cMono::begin() {
  width_ = preset_.width;
  height_ = preset_.height;
  pages_ = height_ / 8;

  fb_ = (uint8_t*)calloc((size_t)width_ * pages_, 1);
  if (!fb_) { error_ = "out of memory"; return false; }

  if (cfg_.pins.rst >= 0) {
    pinMode(cfg_.pins.rst, OUTPUT);
    digitalWrite(cfg_.pins.rst, LOW);
    delay(10);
    digitalWrite(cfg_.pins.rst, HIGH);
    delay(10);
  }

  if (!Wire.begin(cfg_.pins.data, cfg_.pins.clk, cfg_.i2cHz)) {
    error_ = "Wire.begin failed (check CLK/DATA pins)";
    return false;
  }
  // Fall back to the other common address so a module with the solder jumper moved still works.
  addr_ = cfg_.i2cAddr;
  if (!probe(addr_)) {
    const uint8_t alt = addr_ == 0x3C ? 0x3D : 0x3C;
    if (!probe(alt)) {
      error_ = "no OLED found at 0x3C/0x3D (check wiring)";
      return false;
    }
    addr_ = alt;
  }

  sendInit(preset_.init, preset_.initLen);
  // Rotation 0: segment remap + COM scan reversed (module's normal orientation). Rotation 2: both flipped.
  const bool flip = (cfg_.rotation & 3) == 2;
  command(flip ? 0xA0 : 0xA1);
  command(flip ? 0xC0 : 0xC8);
  command(cfg_.invert ? 0xA7 : 0xA6);
  setBrightness(cfg_.brightness);

  markAllDirty();
  flush();
  command(0xAF);  // display on
  return true;
}

void PanelI2cMono::sendInit(const uint8_t* seq, size_t len) {
  size_t i = 0;
  while (i + 1 < len) {
    const uint8_t argc = seq[i + 1] & 0x7F;
    const bool hasDelay = seq[i + 1] & INIT_DELAY;
    uint8_t buf[1 + 0x7F];
    buf[0] = seq[i];
    memcpy(buf + 1, &seq[i + 2], argc);
    commands(buf, 1 + argc);
    i += 2 + argc;
    if (hasDelay) delay(seq[i++]);
  }
}

void PanelI2cMono::commands(const uint8_t* c, size_t len) {
  Wire.beginTransmission(addr_);
  Wire.write(0x00);  // control byte: command stream
  Wire.write(c, len);
  Wire.endTransmission();
}

void PanelI2cMono::pushRect(int16_t x, int16_t y, int16_t w, int16_t h, const uint16_t* px) {
  int16_t stride;
  if (!clipRect(x, y, w, h, width_, height_, &px, &stride)) return;
  for (int16_t r = 0; r < h; r++) {
    const uint16_t* src = px + (int32_t)r * stride;
    for (int16_t c = 0; c < w; c++) setPixel(x + c, y + r, luma565(src[c]) >= 128);
  }
  for (int16_t p = y >> 3; p <= (y + h - 1) >> 3; p++) dirty_ |= 1u << p;
}

void PanelI2cMono::fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t color) {
  if (!clipRect(x, y, w, h, width_, height_)) return;
  const bool on = luma565(color) >= 128;
  for (int16_t r = 0; r < h; r++)
    for (int16_t c = 0; c < w; c++) setPixel(x + c, y + r, on);
  for (int16_t p = y >> 3; p <= (y + h - 1) >> 3; p++) dirty_ |= 1u << p;
}

void PanelI2cMono::flush() {
  // Page addressing works on both SSD1306 and SH1106 (which has no horizontal mode).
  const uint8_t col = cfg_.offX;
  for (uint8_t p = 0; p < pages_; p++) {
    if (!(dirty_ & (1u << p))) continue;
    const uint8_t addr[3] = {(uint8_t)(0xB0 | p), (uint8_t)(col & 0x0F), (uint8_t)(0x10 | (col >> 4))};
    commands(addr, 3);
    const uint8_t* row = fb_ + (size_t)p * width_;
    for (size_t i = 0; i < width_; i += kChunk) {
      Wire.beginTransmission(addr_);
      Wire.write(0x40);  // control byte: data stream
      Wire.write(row + i, min(kChunk, (size_t)width_ - i));
      Wire.endTransmission();
    }
  }
  dirty_ = 0;
}

void PanelI2cMono::setBrightness(uint8_t level) {
  cfg_.brightness = level;
  const uint8_t c[2] = {0x81, level};
  commands(c, 2);
}
