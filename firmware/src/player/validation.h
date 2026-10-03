#pragma once
#include "decoder.h"

namespace dpa {
constexpr uint32_t kMaxJpegBytes = 96 * 1024;

// Structural baseline-JPEG validation. JPEGDEC still decodes the image when played.
// Check segment lengths, baseline dimensions, scan markers, and an exact EOI before storage.
inline bool validJpeg(Source& src, uint32_t begin, uint32_t end, const Rect& r) {
  if (end - begin < 4 || end - begin > kMaxJpegBytes) return false;
  StreamReader in(src, begin, end);
  if (in.next() != 0xff || in.next() != 0xd8) return false;
  bool baseline = false, scan = false;
  for (;;) {
    if (in.next() != 0xff) return false;
    int marker;
    do marker = in.next(); while (marker == 0xff);
    if (marker < 0 || marker == 0 || marker == 0xd8) return false;
    if (marker == 0xd9) return baseline && scan && in.exhausted();
    if (marker >= 0xd0 && marker <= 0xd7) return false;
    const int hi = in.next(), lo = in.next();
    if (hi < 0 || lo < 0) return false;
    const int len = (hi << 8) | lo;
    if (len < 2) return false;
    uint8_t head[6]{};
    for (int i = 0; i < len - 2; i++) {
      const int b = in.next();
      if (b < 0) return false;
      if (i < 6) head[i] = b;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker != 0xc4 && marker != 0xc8 && marker != 0xcc) {
      if (marker != 0xc0 || len < 11 || head[0] != 8 ||
          ((head[1] << 8) | head[2]) != r.h || ((head[3] << 8) | head[4]) != r.w ||
          (head[5] != 1 && head[5] != 3) || len != 8 + 3 * head[5]) return false;
      baseline = true;
    }
    if (marker != 0xda) continue;
    if (!baseline || len < 8 || head[0] < 1 || head[0] > 3 || len != 6 + 2 * head[0]) return false;
    scan = true;
    // Entropy data uses stuffed FF00 bytes and optional restart markers.
    for (;;) {
      const int b = in.next();
      if (b < 0) return false;
      if (b != 0xff) continue;
      int m;
      do m = in.next(); while (m == 0xff);
      if (m == 0 || (m >= 0xd0 && m <= 0xd7)) continue;
      return m == 0xd9 && in.exhausted();
    }
  }
}

// Bounded streaming validation: no image-sized allocation, and no unchecked offset sums.
inline bool validate(Source& src, bool singleFrame = false) {
  uint8_t hb[kHeaderSize];
  Header h;
  const uint32_t size = src.size();
  if (!src.readAt(0, hb, sizeof(hb)) || !parseHeader(hb, sizeof(hb), h) ||
      !h.screenW || !h.screenH || h.canvasH > 1024 || (singleFrame && h.frameCount != 1)) return false;
  const uint32_t paletteEnd = kHeaderSize + uint32_t(h.paletteSize) * 2;
  const uint32_t tableBytes = uint32_t(h.frameCount) * kEntrySize;
  if (h.tableOffset < paletteEnd || h.tableOffset > size || tableBytes > size - h.tableOffset) return false;
  uint32_t previousEnd = h.tableOffset + tableBytes;
  uint8_t scratch[1024];
  for (uint32_t i = 0; i < h.frameCount; i++) {
    uint8_t eb[kEntrySize];
    if (!src.readAt(h.tableOffset + i * kEntrySize, eb, sizeof(eb))) return false;
    const FrameEntry e = parseEntry(eb);
    if (!e.delay || e.size < 8 || e.offset < previousEnd || e.offset > size || e.size > size - e.offset ||
        (e.flags & ~1u) || (i == 0 && !(e.flags & 1))) return false;
    previousEnd = e.offset + e.size;
    Rect r;
    if (!readRect(src, e, r)) return false;
    const bool mono = e.type == kFrameMono;
    if (e.type > kFrameMono || (h.colorMode == kColorMono) != mono ||
        (e.type == kFrameIndexed && !h.paletteSize)) return false;
    const uint32_t height = mono ? (uint32_t(h.canvasH) + 7) & ~7u : h.canvasH;
    if (r.x > h.canvasW || r.w > h.canvasW - r.x || r.y > height || r.h > height - r.y ||
        (mono && ((r.y | r.h) & 7))) return false;
    if (e.flags & 1) {
      if (r.x || r.y || r.w != h.canvasW || r.h != height) return false;
    }
    if (!r.w || !r.h) {
      if (r.x || r.y || r.w || r.h || e.size != 8 || e.type == kFrameJpeg) return false;
      continue;
    }
    if (e.type == kFrameJpeg) {
      if (!validJpeg(src, e.offset + 8, previousEnd, r)) return false;
      continue;
    }
    StreamReader in(src, e.offset + 8, previousEnd);
    RleDecoder rle(in);
    const uint32_t rows = mono ? r.h / 8 : r.h;
    for (uint32_t y = 0; y < rows; y++) {
      if (!rle.read(scratch, r.w)) return false;
      if (!mono) for (uint16_t x = 0; x < r.w; x++) if (scratch[x] >= h.paletteSize) return false;
    }
    if (!rle.finished()) return false;
  }
  return previousEnd == size;
}
} // namespace dpa
