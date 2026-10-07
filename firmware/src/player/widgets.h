#pragma once
// Live clock widgets stored in a .dpa (docs/dpa-format.md, "Widget block"). No Arduino
// dependencies, so the native test can check it against web/src/layers/widgets.ts.
//
// The editor pre-renders every glyph a clock can show as 4-bit alpha bitmaps. Here we pick the
// glyphs for the current time and blend them over pixels on their way to the panel.

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <vector>

#include "decoder.h"
#include "dpa.h"

namespace dpa {

constexpr uint16_t kFlagWidgets = 1;
// Header flags bit 1: the file sets the panel rotation; bits 2-3: that rotation (quarter turns,
// same numbering as the board's display setting). Without bit 1 the board's own rotation is used.
constexpr uint16_t kFlagRotation = 2;
constexpr uint8_t kRotationShift = 2;
constexpr uint32_t kMaxWidgetBlock = 48 * 1024;
constexpr uint8_t kMaxWidgets = 8;
constexpr uint8_t kMaxParts = 32;
constexpr uint16_t kMaxGlyphs = 1024;
constexpr size_t kBlockHead = 12, kGlyphEntry = 8, kWidgetHead = 16, kPartSize = 4;
enum : uint8_t { kPartText = 0, kPartNumber = 1, kPartName = 2 };
enum : uint8_t { kHour, kHour12, kMinute, kSecond, kDay, kMonth, kYear2, kYear, kYearBE, kNumberFields };
enum : uint8_t { kWeekday, kMonthName, kAmPm, kNameFields };
constexpr uint8_t kNameCount[kNameFields] = {7, 12, 2};

struct ClockTime {
  bool valid;
  int16_t year;
  uint8_t month, day, hour, minute, second, wday;  // month 1-12, wday 0 = Sunday
};

inline int numberValue(uint8_t field, const ClockTime& t) {
  switch (field) {
    case kHour: return t.hour;
    case kHour12: return t.hour % 12 ? t.hour % 12 : 12;
    case kMinute: return t.minute;
    case kSecond: return t.second;
    case kDay: return t.day;
    case kMonth: return t.month;
    case kYear2: return t.year % 100;
    case kYear: return t.year;
    default: return t.year + 543;
  }
}

inline uint8_t nameIndex(uint8_t field, const ClockTime& t) {
  return field == kWeekday ? t.wday : field == kMonthName ? t.month - 1 : (t.hour < 12 ? 0 : 1);
}

// Same integer math as blend565() in widgets.ts; a = 0..15.
inline uint16_t blend565(uint16_t d, uint16_t c, uint8_t a) {
  if (a >= 15) return c;
  const uint8_t ia = 15 - a;
  const uint16_t r = (((c >> 11) & 31) * a + ((d >> 11) & 31) * ia + 7) / 15;
  const uint16_t g = (((c >> 5) & 63) * a + ((d >> 5) & 63) * ia + 7) / 15;
  const uint16_t b = ((c & 31) * a + (d & 31) * ia + 7) / 15;
  return (r << 11) | (g << 5) | b;
}

// Structural check of a block in [begin, end) of the file. Everything the renderer indexes is
// bounds-checked here, so the renderer itself does no checks.
inline bool validWidgetBlock(Source& src, uint32_t begin, uint32_t end) {
  if (end < begin || end - begin < kBlockHead) return false;
  uint8_t head[kBlockHead];
  if (!src.readAt(begin, head, sizeof(head)) || memcmp(head, "WDG1", 4)) return false;
  const uint32_t size = rd32(head + 4);
  const uint8_t count = head[8];
  const uint16_t glyphs = rd16(head + 10);
  if (size < kBlockHead || size > end - begin || size > kMaxWidgetBlock || !count || count > kMaxWidgets || !glyphs ||
      glyphs > kMaxGlyphs || kBlockHead + glyphs * kGlyphEntry > size) return false;
  for (uint16_t i = 0; i < glyphs; i++) {
    uint8_t e[kGlyphEntry];
    if (!src.readAt(begin + kBlockHead + i * kGlyphEntry, e, sizeof(e))) return false;
    const uint32_t w = rd16(e), h = rd16(e + 2), off = rd32(e + 4);
    if (!w || !h || w > 2048 || h > 1024 || off > size || ((w + 1) / 2) * h > size - off) return false;
  }
  uint32_t o = kBlockHead + glyphs * kGlyphEntry;
  for (uint8_t i = 0; i < count; i++) {
    uint8_t wh[kWidgetHead];
    if (o + kWidgetHead > size || !src.readAt(begin + o, wh, sizeof(wh))) return false;
    const uint8_t align = wh[10], parts = wh[11];
    const uint16_t digits = rd16(wh + 12);
    if (align > 2 || !parts || parts > kMaxParts || digits + 10u >= glyphs || !rd16(wh + 4) || !rd16(wh + 6)) return false;
    o += kWidgetHead;
    for (uint8_t k = 0; k < parts; k++, o += kPartSize) {
      uint8_t p[kPartSize];
      if (o + kPartSize > size || !src.readAt(begin + o, p, sizeof(p))) return false;
      const uint16_t g = rd16(p + 2);
      if (p[0] == kPartText) { if (g >= glyphs) return false; }
      else if (p[0] == kPartNumber) { if (p[1] >= kNumberFields || g < 1 || g > 4) return false; }
      else if (p[0] == kPartName) { if (p[1] >= kNameFields || g + kNameCount[p[1]] > glyphs) return false; }
      else return false;
    }
  }
  return true;
}

class Widgets {
public:
  ~Widgets() { clear(); }

  void clear() {
    free(block_);
    block_ = nullptr;
    widgets_.clear();
  }

  bool active() const { return !widgets_.empty(); }

  // Loads the block of a validated file (header flag set). False when absent or out of memory.
  bool load(Source& src, const Header& h) {
    clear();
    if (!(h.flags & kFlagWidgets)) return false;
    const uint32_t begin = kHeaderSize + uint32_t(h.paletteSize) * 2;
    if (!validWidgetBlock(src, begin, h.tableOffset)) return false;
    uint8_t head[8];
    if (!src.readAt(begin, head, sizeof(head))) return false;
    const uint32_t size = rd32(head + 4);
    block_ = (uint8_t*)malloc(size);
    if (!block_ || !src.readAt(begin, block_, size)) { clear(); return false; }
    const uint16_t glyphs = rd16(block_ + 10);
    const uint8_t* p = block_ + kBlockHead + glyphs * kGlyphEntry;
    for (uint8_t i = 0; i < block_[8]; i++) {
      Widget w;
      w.x = (int16_t)rd16(p);
      w.y = (int16_t)rd16(p + 2);
      w.w = rd16(p + 4);
      w.h = rd16(p + 6);
      w.color = rd16(p + 8);
      w.align = p[10];
      w.partCount = p[11];
      w.digits = rd16(p + 12);
      w.parts = p + kWidgetHead;
      p += kWidgetHead + w.partCount * kPartSize;
      widgets_.push_back(w);
    }
    return true;
  }

  // Where the canvas sits on the panel: widgets are offset by (dx, dy) and drawn only inside clip.
  void place(int16_t dx, int16_t dy, int16_t clipX, int16_t clipY, int16_t clipW, int16_t clipH) {
    dx_ = dx, dy_ = dy, cx_ = clipX, cy_ = clipY, cw_ = clipW, ch_ = clipH;
  }

  // Lays the text out for this time. True when anything on screen changes.
  bool update(const ClockTime& t) {
    bool changed = false;
    for (Widget& w : widgets_) {
      std::vector<Item> items;
      int16_t x = 0;
      auto put = [&](uint16_t g) { items.push_back({g, x}); x += glyphW(g); };
      for (uint8_t k = 0; k < w.partCount; k++) {
        const uint8_t* p = w.parts + k * kPartSize;
        const uint16_t g = rd16(p + 2);
        if (p[0] == kPartText) put(g);
        else if (p[0] == kPartNumber) {
          if (!t.valid) {
            for (uint16_t d = 0; d < g; d++) put(w.digits + 10);
            continue;
          }
          char buf[8];
          int v = numberValue(p[1], t);
          int n = 0;
          do { buf[n++] = '0' + v % 10; v /= 10; } while (v && n < 7);
          while (n < g) buf[n++] = '0';
          while (n) put(w.digits + (buf[--n] - '0'));
        } else if (t.valid) {
          put(g + nameIndex(p[1], t));
        }
      }
      const int16_t start = w.align == 0 ? 0 : w.align == 1 ? (int16_t)((int)(w.w - x) / 2) : (int16_t)(w.w - x);
      for (Item& it : items) it.x += start;
      if (items.size() != w.items.size() || memcmp(items.data(), w.items.data(), items.size() * sizeof(Item))) {
        w.items.swap(items);
        changed = true;
      }
    }
    return changed;
  }

  // Blends the widgets into a block of RGB565 pixels at (x, y), w×h, stride w.
  void blendRgb565(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t* px) const {
    forEach(x, y, w, h, [&](int16_t sx, int16_t sy, uint8_t a, uint16_t color) {
      uint16_t& d = px[(sy - y) * w + (sx - x)];
      d = blend565(d, color, a);
    });
  }

  // Every widget pixel inside the clip: fn(x, y, alpha 1..15, color). Used for 1-bit panels.
  template <typename F>
  void forEachPixel(F&& fn) const { forEach(cx_, cy_, cw_, ch_, fn); }

  // Panel area the widgets can touch (for dirty tracking). False when nothing is visible.
  bool bounds(int16_t& x, int16_t& y, int16_t& w, int16_t& h) const {
    int x0 = 32767, y0 = 32767, x1 = -32768, y1 = -32768;
    for (const Widget& wd : widgets_) {
      const int bx = wd.x + dx_, by = wd.y + dy_;
      x0 = x0 < bx ? x0 : bx; y0 = y0 < by ? y0 : by;
      x1 = x1 > bx + wd.w ? x1 : bx + wd.w; y1 = y1 > by + wd.h ? y1 : by + wd.h;
    }
    if (x0 < cx_) x0 = cx_;
    if (y0 < cy_) y0 = cy_;
    if (x1 > cx_ + cw_) x1 = cx_ + cw_;
    if (y1 > cy_ + ch_) y1 = cy_ + ch_;
    if (x1 <= x0 || y1 <= y0) return false;
    x = x0, y = y0, w = x1 - x0, h = y1 - y0;
    return true;
  }

private:
  struct Item { uint16_t glyph; int16_t x; };
  struct Widget {
    int16_t x, y;
    uint16_t w, h, color, digits;
    uint8_t align, partCount;
    const uint8_t* parts;
    std::vector<Item> items;
  };

  uint16_t glyphW(uint16_t g) const { return rd16(block_ + kBlockHead + g * kGlyphEntry); }

  template <typename F>
  void forEach(int16_t rx, int16_t ry, int16_t rw, int16_t rh, F&& fn) const {
    for (const Widget& w : widgets_) {
      const int bx = w.x + dx_, by = w.y + dy_;
      // box ∩ clip ∩ requested rect
      int x0 = bx, y0 = by, x1 = bx + w.w, y1 = by + w.h;
      if (x0 < cx_) x0 = cx_;
      if (y0 < cy_) y0 = cy_;
      if (x1 > cx_ + cw_) x1 = cx_ + cw_;
      if (y1 > cy_ + ch_) y1 = cy_ + ch_;
      if (x0 < rx) x0 = rx;
      if (y0 < ry) y0 = ry;
      if (x1 > rx + rw) x1 = rx + rw;
      if (y1 > ry + rh) y1 = ry + rh;
      if (x0 >= x1 || y0 >= y1) continue;
      for (const Item& it : w.items) {
        const uint8_t* e = block_ + kBlockHead + it.glyph * kGlyphEntry;
        const int gw = rd16(e), gh = rd16(e + 2);
        const uint8_t* data = block_ + rd32(e + 4);
        const int stride = (gw + 1) >> 1;
        const int gx = bx + it.x;
        const int cx0 = gx > x0 ? gx : x0, cx1 = gx + gw < x1 ? gx + gw : x1;
        const int cy0 = by > y0 ? by : y0, cy1 = by + gh < y1 ? by + gh : y1;
        for (int sy = cy0; sy < cy1; sy++) {
          const uint8_t* row = data + (sy - by) * stride;
          for (int sx = cx0; sx < cx1; sx++) {
            const int col = sx - gx;
            const uint8_t a = col & 1 ? row[col >> 1] & 15 : row[col >> 1] >> 4;
            if (a) fn((int16_t)sx, (int16_t)sy, a, w.color);
          }
        }
      }
    }
  }

  uint8_t* block_ = nullptr;
  std::vector<Widget> widgets_;
  int16_t dx_ = 0, dy_ = 0, cx_ = 0, cy_ = 0, cw_ = 0, ch_ = 0;
};

}  // namespace dpa
