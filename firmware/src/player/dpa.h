#pragma once
#include <stddef.h>
#include <stdint.h>

// DPA file format, see docs/dpa-format.md. All fields little-endian.
namespace dpa {

constexpr size_t kHeaderSize = 32;
constexpr size_t kEntrySize = 12;
constexpr uint8_t kColorRgb565 = 0;
constexpr uint8_t kColorMono = 1;
constexpr uint8_t kFrameIndexed = 0;
constexpr uint8_t kFrameJpeg = 1;
constexpr uint8_t kFrameMono = 2;

struct Header {
  uint8_t version;
  uint8_t colorMode;
  uint16_t screenW, screenH;
  uint16_t canvasW, canvasH;
  uint8_t scale;
  uint8_t loop;
  int16_t offsetX, offsetY;
  uint16_t frameCount;
  uint16_t paletteSize;
  uint16_t bgColor;
  uint16_t flags;  // bit 0: widget block after the palette (player/widgets.h)
  uint32_t tableOffset;
};

struct FrameEntry {
  uint32_t offset;
  uint32_t size;
  uint16_t delay;
  uint8_t type;
  uint8_t flags;
};

inline uint16_t rd16(const uint8_t* p) { return p[0] | (p[1] << 8); }
inline uint32_t rd32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((uint32_t)p[3] << 24); }

// Parses and sanity-checks the header. Returns false for anything this firmware cannot play.
inline bool parseHeader(const uint8_t* b, size_t len, Header& h) {
  if (len < kHeaderSize || b[0] != 'D' || b[1] != 'P' || b[2] != 'A' || b[3] != '1') return false;
  h.version = b[4];
  h.colorMode = b[5];
  h.screenW = rd16(b + 6);
  h.screenH = rd16(b + 8);
  h.canvasW = rd16(b + 10);
  h.canvasH = rd16(b + 12);
  h.scale = b[14];
  h.loop = b[15];
  h.offsetX = (int16_t)rd16(b + 16);
  h.offsetY = (int16_t)rd16(b + 18);
  h.frameCount = rd16(b + 20);
  h.paletteSize = rd16(b + 22);
  h.bgColor = rd16(b + 24);
  h.flags = rd16(b + 26);
  h.tableOffset = rd32(b + 28);
  return h.version == 1 && h.colorMode <= kColorMono && h.scale >= 1 && h.scale <= 8 && h.canvasW > 0 &&
         h.canvasH > 0 && h.canvasW <= 1024 && h.frameCount > 0 && h.paletteSize <= 256;
}

inline FrameEntry parseEntry(const uint8_t* b) {
  return {rd32(b), rd32(b + 4), rd16(b + 8), b[10], b[11]};
}

}  // namespace dpa
