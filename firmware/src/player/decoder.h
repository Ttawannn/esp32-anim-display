#pragma once
// Frame decoding shared by the player and the native tests (no Arduino dependencies).
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <algorithm>

#include "dpa.h"

// Random-access byte source: an animation file or an in-memory buffer.
class Source {
public:
  virtual ~Source() = default;
  virtual bool readAt(uint32_t offset, uint8_t* dst, size_t len) = 0;
  virtual uint32_t size() const = 0;
};

class MemSource : public Source {
public:
  MemSource(uint8_t* data, size_t len, bool owned = true) : data_(data), len_(len), owned_(owned) {}
  ~MemSource() override {
    if (owned_) free(data_);
  }
  bool readAt(uint32_t offset, uint8_t* dst, size_t len) override {
    if (offset > len_ || len > len_ - offset) return false;
    memcpy(dst, data_ + offset, len);
    return true;
  }
  uint32_t size() const override { return len_; }

private:
  uint8_t* data_;
  size_t len_;
  bool owned_;
};

// Sequential buffered reader over a byte range of a Source.
class StreamReader {
public:
  StreamReader(Source& src, uint32_t start, uint32_t end) : src_(src), pos_(start), end_(end) {}
  bool exhausted() const { return pos_ == end_ && bufPos_ == bufLen_; }
  int next() {
    if (bufPos_ == bufLen_) {
      if (pos_ >= end_) return -1;
      bufLen_ = std::min<uint32_t>(sizeof(buf_), end_ - pos_);
      if (!src_.readAt(pos_, buf_, bufLen_)) return -1;
      pos_ += bufLen_;
      bufPos_ = 0;
    }
    return buf_[bufPos_++];
  }

private:
  Source& src_;
  uint32_t pos_, end_;
  uint8_t buf_[256];
  size_t bufLen_ = 0, bufPos_ = 0;
};

// PackBits decoder whose runs may span read() calls (rows).
class RleDecoder {
public:
  explicit RleDecoder(StreamReader& in) : in_(in) {}
  bool finished() const { return literal_ == 0 && repeat_ == 0 && in_.exhausted(); }
  bool read(uint8_t* out, size_t n) {
    for (size_t i = 0; i < n; i++) {
      if (literal_ == 0 && repeat_ == 0) {
        const int c = in_.next();
        if (c < 0) return false;
        if (c < 128) {
          literal_ = c + 1;
        } else {
          const int v = in_.next();
          if (v < 0) return false;
          repeat_ = c - 126;
          value_ = v;
        }
      }
      if (literal_) {
        const int v = in_.next();
        if (v < 0) return false;
        out[i] = v;
        literal_--;
      } else {
        out[i] = value_;
        repeat_--;
      }
    }
    return true;
  }

private:
  StreamReader& in_;
  int literal_ = 0, repeat_ = 0;
  uint8_t value_ = 0;
};

namespace dpa {

struct Rect {
  uint16_t x, y, w, h;
};

// Every frame starts with the rect it covers (canvas coordinates).
inline bool readRect(Source& src, const FrameEntry& e, Rect& r) {
  uint8_t b[8];
  if (!src.readAt(e.offset, b, 8)) return false;
  r = {rd16(b), rd16(b + 2), rd16(b + 4), rd16(b + 6)};
  return true;
}

// INDEXED: calls row(canvasY, rgb565Row) for each of the r.h rows (r.w pixels each).
// idx and px must hold r.w entries.
template <typename RowFn>
bool decodeIndexed(Source& src, const FrameEntry& e, const Header& h, const Rect& r, const uint16_t* palette,
                   uint8_t* idx, uint16_t* px, RowFn row) {
  if (r.w == 0) return true;
  if (r.x + r.w > h.canvasW || r.y + r.h > h.canvasH) return false;
  StreamReader in(src, e.offset + 8, e.offset + e.size);
  RleDecoder rle(in);
  for (uint16_t i = 0; i < r.h; i++) {
    if (!rle.read(idx, r.w)) return false;
    for (uint16_t c = 0; c < r.w; c++) {
      if (idx[c] >= h.paletteSize) return false;
      px[c] = palette[idx[c]];
    }
    row(r.y + i, px);
  }
  return true;
}

// MONO: calls page(pageIndex, bytes) for each 8-row page (r.w bytes, bit 0 = top row).
template <typename PageFn>
bool decodeMono(Source& src, const FrameEntry& e, const Header& h, const Rect& r, uint8_t* bytes, PageFn page) {
  if (r.w == 0) return true;
  const uint32_t paddedHeight = (uint32_t(h.canvasH) + 7) & ~7u;
  if (((r.y | r.h) & 7) || r.x + r.w > h.canvasW || r.y >= h.canvasH ||
      uint32_t(r.y) + r.h > paddedHeight) return false;
  StreamReader in(src, e.offset + 8, e.offset + e.size);
  RleDecoder rle(in);
  for (uint16_t p = 0; p < r.h / 8; p++) {
    if (!rle.read(bytes, r.w)) return false;
    page(r.y / 8 + p, bytes);
  }
  return true;
}

}  // namespace dpa
