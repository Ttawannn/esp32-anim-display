#pragma once
#include "panel.h"

// Small on-device drawing helpers for boot/status/test screens. Animations are pre-rendered
// in the browser, so this is intentionally minimal.

constexpr uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

namespace color {
constexpr uint16_t Black = 0x0000, White = 0xFFFF, Red = 0xF800, Green = 0x07E0, Blue = 0x001F,
                   Cyan = 0x07FF, Magenta = 0xF81F, Yellow = 0xFFE0, Gray = 0x8410, DarkGray = 0x2104;
}

// Pixel shader: returns the color of (x, y).
using ShaderFn = uint16_t (*)(int16_t x, int16_t y, void* ctx);

void gfxRenderShader(Panel& p, int16_t x, int16_t y, int16_t w, int16_t h, ShaderFn fn, void* ctx);
void gfxDrawText(Panel& p, int16_t x, int16_t y, const char* s, uint16_t fg, uint16_t bg, uint8_t scale = 1);
void gfxDrawTextCentered(Panel& p, int16_t y, const char* s, uint16_t fg, uint16_t bg, uint8_t scale = 1);
int16_t gfxTextWidth(const char* s, uint8_t scale = 1);
constexpr int16_t gfxLineHeight(uint8_t scale = 1) { return 9 * scale; }

// Orientation / color-order / offset check pattern.
void gfxTestPattern(Panel& p, const char* title, bool round);
// Lines of text, top-aligned, auto scale for large panels.
void gfxTextScreen(Panel& p, const char* const* lines, size_t count);

// Animated plasma for visual smoke tests and fps measurement. Mono panels get ordered dithering.
void gfxPlasmaFrame(Panel& p, uint32_t t);
