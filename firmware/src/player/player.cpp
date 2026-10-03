#include "player.h"

#include <LittleFS.h>

#include "display/panel_i2c_mono.h"
#include "storage/storage.h"

static constexpr size_t kBandPixels = 240 * 16;
static constexpr size_t kMaxJpegFrame = 96 * 1024;

// Collects canvas rows, enlarges them by `scale` (nearest neighbour) into the band buffer and
// pushes full bands to the panel.
class BandWriter {
public:
  BandWriter(Panel& p, uint16_t* band, size_t cap, int16_t x, int16_t y, int16_t w, uint8_t s)
      : p_(p), band_(band), cap_(cap), x_(x), y_(y), sw_(w * s), s_(s), ok_((size_t)w * s * s <= cap) {}

  bool ok() const { return ok_; }

  void addRow(const uint16_t* px) {
    uint16_t* line = band_ + used_;
    uint16_t* d = line;
    const int16_t w = sw_ / s_;
    if (s_ == 1) {
      memcpy(d, px, w * 2);
    } else {
      for (int16_t c = 0; c < w; c++)
        for (uint8_t k = 0; k < s_; k++) *d++ = px[c];
    }
    for (uint8_t k = 1; k < s_; k++) memcpy(line + k * sw_, line, sw_ * 2);
    used_ += (size_t)sw_ * s_;
    rows_ += s_;
    if (used_ + (size_t)sw_ * s_ > cap_) flush();
  }

  void skipRow() {
    flush();
    y_ += s_;
  }

  void flush() {
    if (!rows_) return;
    p_.pushRect(x_, y_, sw_, rows_, band_);
    y_ += rows_;
    used_ = 0;
    rows_ = 0;
  }

private:
  Panel& p_;
  uint16_t* band_;
  size_t cap_;
  int16_t x_, y_, sw_;
  uint8_t s_;
  bool ok_;
  size_t used_ = 0;
  int16_t rows_ = 0;
};

Player::~Player() {
  stop();
  free(band_);
}

void Player::begin(Panel* panel) {
  panel_ = panel;
  band_ = (uint16_t*)malloc(kBandPixels * 2);
  bandPixels_ = band_ ? kBandPixels : 0;
}

void Player::stop() {
  src_.reset();
  free(table_);
  table_ = nullptr;
  free(row_);
  row_ = nullptr;
  free(rowPx_);
  rowPx_ = nullptr;
  delete jpeg_;
  jpeg_ = nullptr;
  free(jpegBuf_);
  jpegBuf_ = nullptr;
  jpegBufSize_ = 0;
  name_ = "";
  live_ = false;
  finished_ = false;
  frame_ = 0;
  loops_ = 0;
  fps_ = 0;
}

bool Player::playFile(const String& name) {
  File f = LittleFS.open(storage::animPath(name), "r");
  if (!f) {
    stop();
    error_ = "file not found";
    return false;
  }
  if (!open(std::unique_ptr<Source>(new FileSource(f)))) return false;
  name_ = name;
  return true;
}

bool Player::playMemory(uint8_t* data, size_t len) {
  if (!open(std::unique_ptr<Source>(new MemSource(data, len)))) return false;
  name_ = "(live)";
  live_ = true;
  return true;
}

bool Player::open(std::unique_ptr<Source> src) {
  stop();
  error_ = nullptr;
  auto fail = [this](const char* msg) {
    stop();
    error_ = msg;
    return false;
  };
  if (!panel_ || !band_) return fail("player not initialised");

  uint8_t hb[dpa::kHeaderSize];
  if (!src->readAt(0, hb, sizeof(hb)) || !dpa::parseHeader(hb, sizeof(hb), h_)) return fail("not a valid DPA file");

  if (h_.paletteSize) {
    uint8_t pb[512];
    if (!src->readAt(dpa::kHeaderSize, pb, h_.paletteSize * 2)) return fail("truncated palette");
    for (uint16_t i = 0; i < h_.paletteSize; i++) palette_[i] = dpa::rd16(pb + i * 2);
  }

  table_ = (dpa::FrameEntry*)malloc(sizeof(dpa::FrameEntry) * h_.frameCount);
  if (!table_) return fail("out of memory (frame table)");
  const uint32_t fileSize = src->size();
  uint8_t eb[dpa::kEntrySize * 32];
  for (uint32_t i = 0; i < h_.frameCount; i += 32) {
    const uint16_t n = min<uint16_t>(32, h_.frameCount - i);
    if (!src->readAt(h_.tableOffset + i * dpa::kEntrySize, eb, n * dpa::kEntrySize)) return fail("truncated frame table");
    for (uint16_t k = 0; k < n; k++) {
      dpa::FrameEntry e = dpa::parseEntry(eb + k * dpa::kEntrySize);
      if (e.size < 8 || e.offset > fileSize || e.size > fileSize - e.offset || e.delay == 0)
        return fail("corrupt frame table");
      table_[i + k] = e;
    }
  }

  row_ = (uint8_t*)malloc(h_.canvasW);
  rowPx_ = (uint16_t*)malloc(h_.canvasW * 2);
  if (!row_ || !rowPx_) return fail("out of memory (row buffer)");

  // Files made for a different screen size are centred.
  baseX_ = h_.offsetX + ((int)panel_->width() - (int)h_.screenW) / 2;
  baseY_ = h_.offsetY + ((int)panel_->height() - (int)h_.screenH) / 2;
  const uint16_t bg = h_.colorMode == dpa::kColorMono ? (h_.bgColor ? 0xFFFF : 0x0000) : h_.bgColor;
  panel_->fillScreen(bg);

  src_ = std::move(src);
  frame_ = 0;
  loops_ = 0;
  finished_ = false;
  nextAt_ = millis();
  fpsWindow_ = millis();
  fpsFrames_ = 0;
  return true;
}

void Player::tick() {
  if (!src_ || finished_) return;
  const uint32_t now = millis();
  if ((int32_t)(now - nextAt_) < 0) return;

  if (frame_ >= h_.frameCount) {  // the last frame has been shown for its full delay
    loops_++;
    if (h_.loop && loops_ >= h_.loop) {
      finished_ = true;
      return;
    }
    frame_ = 0;
    if (h_.frameCount == 1) {  // still image: nothing to redraw
      nextAt_ = now + table_[0].delay;
      frame_ = 1;
      return;
    }
  }

  if (!drawFrame(frame_)) {
    error_ = "frame decode failed";
    finished_ = true;
    return;
  }
  panel_->flush();

  const uint16_t delay = table_[frame_].delay;
  nextAt_ += delay;
  if ((int32_t)(millis() - nextAt_) > (int32_t)delay) nextAt_ = millis();  // fell behind: resync
  frame_++;

  fpsFrames_++;
  if (millis() - fpsWindow_ >= 1000) {
    fps_ = fpsFrames_ * 1000.0f / (millis() - fpsWindow_);
    fpsFrames_ = 0;
    fpsWindow_ = millis();
  }
}

bool Player::drawFrame(uint16_t i) {
  const dpa::FrameEntry& e = table_[i];
  switch (e.type) {
    case dpa::kFrameIndexed: return drawIndexed(e);
    case dpa::kFrameMono: return drawMono(e);
    case dpa::kFrameJpeg: return drawJpeg(e);
  }
  return false;
}

bool Player::readRect(const dpa::FrameEntry& e, uint16_t r[4]) {
  dpa::Rect rect;
  if (!dpa::readRect(*src_, e, rect)) return false;
  r[0] = rect.x, r[1] = rect.y, r[2] = rect.w, r[3] = rect.h;
  return rect.x + rect.w <= h_.canvasW && rect.y + rect.h <= h_.canvasH;
}

bool Player::drawIndexed(const dpa::FrameEntry& e) {
  dpa::Rect r;
  if (!dpa::readRect(*src_, e, r)) return false;
  if (r.w == 0) return true;  // unchanged frame
  const uint8_t s = h_.scale;
  BandWriter out(*panel_, band_, bandPixels_, baseX_ + r.x * s, baseY_ + r.y * s, r.w, s);
  if (!out.ok()) return false;
  uint16_t* px = rowPx_;
  const bool ok = dpa::decodeIndexed(*src_, e, h_, r, palette_, row_, px, [&](uint16_t, const uint16_t* row) { out.addRow(row); });
  out.flush();
  return ok;
}

bool Player::drawMono(const dpa::FrameEntry& e) {
  dpa::Rect r;
  if (!dpa::readRect(*src_, e, r)) return false;
  if (r.w == 0) return true;
  const int16_t sx = baseX_ + r.x, sy = baseY_ + r.y;

  // Fast path: page bytes go straight into the OLED framebuffer.
  if (panel_->colorMode() == ColorMode::Mono && h_.scale == 1 && (sy & 7) == 0 && sx >= 0 && sy >= 0 &&
      sx + r.w <= panel_->width() && sy + r.h <= panel_->height()) {
    auto* oled = static_cast<PanelI2cMono*>(panel_);
    uint8_t* fb = oled->framebuffer();
    const int16_t pageShift = (sy - r.y) / 8;
    return dpa::decodeMono(*src_, e, h_, r, row_, [&](uint16_t page, const uint8_t* bytes) {
      const uint16_t screenPage = page + pageShift;
      memcpy(fb + screenPage * panel_->width() + sx, bytes, r.w);
      oled->markDirty(1u << screenPage);
    });
  }

  // Generic path (scaled, unaligned or on a color panel): expand bits to white/black pixels.
  const uint8_t s = h_.scale;
  BandWriter out(*panel_, band_, bandPixels_, baseX_ + r.x * s, baseY_ + r.y * s, r.w, s);
  if (!out.ok()) return false;
  uint16_t* px = rowPx_;
  const bool ok = dpa::decodeMono(*src_, e, h_, r, row_, [&](uint16_t page, const uint8_t* bytes) {
    for (uint8_t b = 0; b < 8; b++) {
      if (page * 8 + b >= h_.canvasH) {  // padding rows of the last page
        out.skipRow();
        continue;
      }
      for (uint16_t c = 0; c < r.w; c++) px[c] = (bytes[c] >> b) & 1 ? 0xFFFF : 0x0000;
      out.addRow(px);
    }
  });
  out.flush();
  return ok;
}

bool Player::drawJpeg(const dpa::FrameEntry& e) {
  if (!readRect(e, jpegRect_)) return false;
  const size_t len = e.size - 8;
  if (len > kMaxJpegFrame) return false;
  if (len > jpegBufSize_) {
    free(jpegBuf_);
    jpegBuf_ = (uint8_t*)malloc(len);
    jpegBufSize_ = jpegBuf_ ? len : 0;
    if (!jpegBuf_) return false;
  }
  if (!src_->readAt(e.offset + 8, jpegBuf_, len)) return false;
  if (!jpeg_) jpeg_ = new JPEGDEC();
  if (!jpeg_->openRAM(jpegBuf_, len, jpegDraw)) return false;
  jpeg_->setUserPointer(this);
  jpeg_->setPixelType(RGB565_LITTLE_ENDIAN);
  const bool ok = jpeg_->decode(0, 0, 0);
  jpeg_->close();
  return ok;
}

int Player::jpegDraw(JPEGDRAW* d) {
  auto* self = static_cast<Player*>(d->pUser);
  const uint16_t* r = self->jpegRect_;
  const uint8_t s = self->h_.scale;
  // MCU blocks can extend past the image edge: clip to the frame rect.
  const int16_t w = min<int>(d->iWidth, (int)r[2] - d->x);
  const int16_t h = min<int>(d->iHeight, (int)r[3] - d->y);
  if (w <= 0 || h <= 0) return 1;
  const int16_t x = self->baseX_ + (r[0] + d->x) * s, y = self->baseY_ + (r[1] + d->y) * s;
  if (s == 1 && w == d->iWidth) {
    self->panel_->pushRect(x, y, w, h, d->pPixels);
    return 1;
  }
  BandWriter out(*self->panel_, self->band_, self->bandPixels_, x, y, w, s);
  if (!out.ok()) return 0;
  for (int16_t row = 0; row < h; row++) out.addRow(d->pPixels + row * d->iWidth);
  out.flush();
  return 1;
}
