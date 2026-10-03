#include "gfx.h"

#include <Arduino.h>
#include <math.h>

#include "font5x7.h"

static constexpr size_t kBandPixels = 240 * 8;

static uint16_t* bandBuffer() {
  static uint16_t* buf = (uint16_t*)malloc(kBandPixels * 2);
  return buf;
}

void gfxRenderShader(Panel& p, int16_t x, int16_t y, int16_t w, int16_t h, ShaderFn fn, void* ctx) {
  uint16_t* buf = bandBuffer();
  const int16_t rows = max<int16_t>(1, kBandPixels / w);
  for (int16_t row = 0; row < h; row += rows) {
    const int16_t n = min<int16_t>(rows, h - row);
    uint16_t* dst = buf;
    for (int16_t r = 0; r < n; r++)
      for (int16_t c = 0; c < w; c++) *dst++ = fn(x + c, y + row + r, ctx);
    p.pushRect(x, y + row, w, n, buf);
  }
}

int16_t gfxTextWidth(const char* s, uint8_t scale) {
  return strlen(s) * 6 * scale;
}

void gfxDrawText(Panel& p, int16_t x, int16_t y, const char* s, uint16_t fg, uint16_t bg, uint8_t scale) {
  const int16_t cw = 6 * scale, ch = 8 * scale;
  uint16_t* buf = bandBuffer();
  if ((size_t)cw * ch > kBandPixels) return;
  for (; *s; s++, x += cw) {
    const uint8_t code = (*s < 0x20 || *s > 0x7E) ? '?' : *s;
    const uint8_t* glyph = kFont5x7[code - 0x20];
    for (int16_t py = 0; py < ch; py++) {
      for (int16_t px = 0; px < cw; px++) {
        const int16_t col = px / scale, row = py / scale;
        const bool on = col < 5 && (glyph[col] >> row) & 1;
        buf[py * cw + px] = on ? fg : bg;
      }
    }
    p.pushRect(x, y, cw, ch, buf);
  }
}

void gfxDrawTextCentered(Panel& p, int16_t y, const char* s, uint16_t fg, uint16_t bg, uint8_t scale) {
  gfxDrawText(p, (p.width() - gfxTextWidth(s, scale)) / 2, y, s, fg, bg, scale);
}

// ---------------------------------------------------------------------------------------------
// Test pattern
//
//  - 1 px white border: a missing edge or a line of garbage means the offset is wrong
//  - red marker = top-left (round: top), green = top-right (round: right), blue = bottom-left
//    (round: left). Red/blue swapped -> toggle BGR. Colors look like a negative -> toggle invert.
//  - 8 color bars and a gray ramp to judge color depth and gamma

struct PatternCtx {
  int16_t w, h, marker;
  bool round, mono;
};

static uint16_t patternShader(int16_t x, int16_t y, void* vctx) {
  const auto& c = *static_cast<PatternCtx*>(vctx);
  const int16_t w = c.w, h = c.h, m = c.marker;

  if (c.round) {
    const float dx = x - (w - 1) / 2.0f, dy = y - (h - 1) / 2.0f;
    const float d = sqrtf(dx * dx + dy * dy), r = w / 2.0f - 1;
    if (fabsf(d - r) < 1.0f) return color::Yellow;
    if (d > r) return color::Black;
    const int16_t cx = w / 2, cy = h / 2;
    if (abs(x - cx) < m / 2 && y >= 4 && y < 4 + m) return color::Red;           // top
    if (abs(y - cy) < m / 2 && x >= w - 4 - m && x < w - 4) return color::Green;  // right
    if (abs(y - cy) < m / 2 && x >= 4 && x < 4 + m) return color::Blue;           // left
  } else {
    if (x == 0 || y == 0 || x == w - 1 || y == h - 1) return color::White;
    if (x < 1 + m && y < 1 + m) return color::Red;
    if (x >= w - 1 - m && y < 1 + m) return color::Green;
    if (x < 1 + m && y >= h - 1 - m) return color::Blue;
  }

  if (c.mono) {
    // Checkerboard block in the lower half: shows pixel-exact addressing.
    if (y >= h / 2 && x >= w / 2 && x < w - 4 && y < h - 4) return ((x / 4 + y / 4) & 1) ? color::White : color::Black;
    return color::Black;
  }

  const int16_t barTop = h * 30 / 100, barBottom = h * 62 / 100;
  const int16_t rampTop = h * 66 / 100, rampBottom = h * 76 / 100;
  const int16_t inset = c.round ? w / 8 : 2;
  if (x < inset || x >= w - inset) return color::Black;
  const int16_t span = w - 2 * inset;
  if (y >= barTop && y < barBottom) {
    static constexpr uint16_t kBars[8] = {color::Red, color::Green, color::Blue, color::White,
                                          color::Cyan, color::Magenta, color::Yellow, color::Gray};
    return kBars[(x - inset) * 8 / span];
  }
  if (y >= rampTop && y < rampBottom) {
    const uint8_t v = (x - inset) * 255 / (span - 1);
    return rgb565(v, v, v);
  }
  return color::Black;
}

void gfxTestPattern(Panel& p, const char* title, bool round) {
  PatternCtx ctx{(int16_t)p.width(), (int16_t)p.height(), 0, round, p.colorMode() == ColorMode::Mono};
  ctx.marker = max<int16_t>(6, min(ctx.w, ctx.h) / 10);
  gfxRenderShader(p, 0, 0, ctx.w, ctx.h, patternShader, &ctx);

  char size[16];
  snprintf(size, sizeof(size), "%dx%d", ctx.w, ctx.h);
  const uint8_t scale = min(ctx.w, ctx.h) >= 200 ? 2 : 1;
  if (ctx.mono) {
    gfxDrawText(p, ctx.marker + 4, 3, title, color::White, color::Black);
    gfxDrawText(p, ctx.marker + 4, 3 + gfxLineHeight(), size, color::White, color::Black);
  } else {
    const int16_t y = ctx.h * 12 / 100;
    gfxDrawTextCentered(p, y, title, color::White, color::Black, scale);
    gfxDrawTextCentered(p, y + gfxLineHeight(scale), size, color::Gray, color::Black, scale);
    gfxDrawTextCentered(p, ctx.h * 80 / 100, round ? "red = top" : "red = top-left", color::Red, color::Black);
  }
  p.flush();
}

void gfxTextScreen(Panel& p, const char* const* lines, size_t count) {
  const uint8_t scale = p.width() >= 200 ? 2 : 1;
  p.fillScreen(color::Black);
  const bool round = p.width() == p.height() && p.width() >= 200;  // keep text inside a round glass
  int16_t y = round ? p.height() / 5 : 2;
  for (size_t i = 0; i < count && y + gfxLineHeight(scale) <= p.height(); i++) {
    if (round) {
      gfxDrawTextCentered(p, y, lines[i], i == 0 ? color::Yellow : color::White, color::Black, scale);
    } else {
      gfxDrawText(p, 2, y, lines[i], i == 0 ? color::Yellow : color::White, color::Black, scale);
    }
    y += gfxLineHeight(scale);
  }
  p.flush();
}

// ---------------------------------------------------------------------------------------------
// Plasma

struct PlasmaCtx {
  uint32_t t;
  bool mono;
};

static uint8_t kSin[256];
static uint16_t kPalette[256];

static void plasmaInit() {
  static bool done = false;
  if (done) return;
  for (int i = 0; i < 256; i++) {
    kSin[i] = 128 + 127 * sinf(i * 2 * PI / 256);
    const float h = i / 256.0f * 6;
    const float f = h - floorf(h);
    uint8_t r, g, b;
    switch ((int)h) {
      case 0: r = 255; g = f * 255; b = 0; break;
      case 1: r = (1 - f) * 255; g = 255; b = 0; break;
      case 2: r = 0; g = 255; b = f * 255; break;
      case 3: r = 0; g = (1 - f) * 255; b = 255; break;
      case 4: r = f * 255; g = 0; b = 255; break;
      default: r = 255; g = 0; b = (1 - f) * 255; break;
    }
    kPalette[i] = rgb565(r, g, b);
  }
  done = true;
}

static uint16_t plasmaShader(int16_t x, int16_t y, void* vctx) {
  const auto& c = *static_cast<PlasmaCtx*>(vctx);
  const uint32_t t = c.t;
  const uint8_t v = (kSin[(uint8_t)(x * 3 + t)] + kSin[(uint8_t)(y * 2 + t * 2)] +
                     kSin[(uint8_t)((x + y) * 2 - t * 3)] + kSin[(uint8_t)(x - y + t)]) >> 2;
  if (c.mono) {
    static constexpr uint8_t kBayer4[16] = {0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5};
    return v > kBayer4[(y & 3) * 4 + (x & 3)] * 16 + 8 ? color::White : color::Black;
  }
  return kPalette[(uint8_t)(v + t)];
}

void gfxPlasmaFrame(Panel& p, uint32_t t) {
  plasmaInit();
  PlasmaCtx ctx{t, p.colorMode() == ColorMode::Mono};
  gfxRenderShader(p, 0, 0, p.width(), p.height(), plasmaShader, &ctx);
}
