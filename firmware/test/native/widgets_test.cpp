// Native (PC) test for live clock widgets: loads the widget block from the shared vectors written
// by web/src/layers/widgets.test.ts, composites it for a fixed time (and for "time unknown") and
// compares with the screens the web reference renderer produced.
//
//   python -m ziglang c++ -std=c++17 -O1 -Ifirmware/src firmware/test/native/widgets_test.cpp -o build/widgets_test.exe
//   build/widgets_test.exe shared/test-vectors

#include <stdio.h>

#include <string>
#include <vector>

#include "player/validation.h"
#include "player/widgets.h"

static std::vector<uint8_t> readFile(const std::string& path) {
  std::vector<uint8_t> out;
  FILE* f = fopen(path.c_str(), "rb");
  if (!f) return out;
  uint8_t buf[4096];
  size_t n;
  while ((n = fread(buf, 1, sizeof(buf), f)) > 0) out.insert(out.end(), buf, buf + n);
  fclose(f);
  return out;
}

static const dpa::ClockTime kTimes[2] = {
  {true, 2026, 10, 4, 9, 5, 7, 0},
  {false, 2026, 10, 4, 9, 5, 7, 0},
};

static bool load(const std::string& dir, const char* name, std::vector<uint8_t>& file, std::vector<uint8_t>& expected,
                 dpa::Header& h, dpa::Widgets& w) {
  file = readFile(dir + "/" + name + ".dpa");
  expected = readFile(dir + "/" + name + ".widgets");
  if (file.empty() || expected.empty()) {
    printf("FAIL %s: vector files missing (run npm test in web/)\n", name);
    return false;
  }
  MemSource src(file.data(), file.size(), false);
  if (!dpa::parseHeader(file.data(), file.size(), h) || !dpa::validate(src)) {
    printf("FAIL %s: file does not validate\n", name);
    return false;
  }
  if (!w.load(src, h)) {
    printf("FAIL %s: widget block did not load\n", name);
    return false;
  }
  return true;
}

static bool rgbCase(const std::string& dir) {
  std::vector<uint8_t> file, expected;
  dpa::Header h;
  dpa::Widgets w;
  if (!load(dir, "clock_rgb", file, expected, h, w)) return false;
  const int sw = h.screenW, sh = h.screenH;
  if (expected.size() != size_t(sw) * sh * 2 * 2) { printf("FAIL clock_rgb: expected size\n"); return false; }
  w.place(0, 0, h.offsetX, h.offsetY, h.canvasW * h.scale, h.canvasH * h.scale);
  for (int k = 0; k < 2; k++) {
    if (!w.update(kTimes[k]) && k == 0) { printf("FAIL clock_rgb: first update reported no change\n"); return false; }
    std::vector<uint16_t> screen(size_t(sw) * sh, 0x1234);
    // Composite in 16-row bands, like the player's band buffer.
    for (int y = 0; y < sh; y += 16) w.blendRgb565(0, y, sw, 16, screen.data() + size_t(y) * sw);
    const uint8_t* exp = expected.data() + size_t(k) * sw * sh * 2;
    for (int i = 0; i < sw * sh; i++) {
      if (screen[i] != dpa::rd16(exp + i * 2)) {
        printf("FAIL clock_rgb time %d: pixel (%d,%d) = %04x, expected %04x\n", k, i % sw, i / sw, screen[i], dpa::rd16(exp + i * 2));
        return false;
      }
    }
  }
  if (w.update(kTimes[1])) { printf("FAIL clock_rgb: unchanged time reported a change\n"); return false; }
  printf("ok   clock_rgb: %d widgets blended in bands, valid + unknown time\n", 3);
  return true;
}

static bool monoCase(const std::string& dir) {
  std::vector<uint8_t> file, expected;
  dpa::Header h;
  dpa::Widgets w;
  if (!load(dir, "clock_mono", file, expected, h, w)) return false;
  const int sw = h.screenW, sh = h.screenH;
  if (expected.size() != size_t(sw) * sh * 2) { printf("FAIL clock_mono: expected size\n"); return false; }
  w.place(0, 0, 0, 0, sw, sh);
  for (int k = 0; k < 2; k++) {
    w.update(kTimes[k]);
    std::vector<uint8_t> screen(size_t(sw) * sh);
    for (size_t i = 0; i < screen.size(); i++) screen[i] = (i >> 3) & 1;
    w.forEachPixel([&](int16_t x, int16_t y, uint8_t a, uint16_t c) { if (a >= 8) screen[y * sw + x] = c ? 1 : 0; });
    if (memcmp(screen.data(), expected.data() + size_t(k) * sw * sh, screen.size())) {
      printf("FAIL clock_mono time %d\n", k);
      return false;
    }
  }
  printf("ok   clock_mono\n");
  return true;
}

static bool rejectsCorrupt(const std::string& dir) {
  std::vector<uint8_t> file = readFile(dir + "/clock_rgb.dpa");
  if (file.empty()) return false;
  const uint32_t block = dpa::kHeaderSize + dpa::rd16(&file[22]) * 2;
  // Point a TEXT part past the glyph table: validation must refuse the file.
  std::vector<uint8_t> bad = file;
  const uint16_t glyphs = dpa::rd16(&bad[block + 10]);
  const uint32_t part = block + dpa::kBlockHead + glyphs * dpa::kGlyphEntry + dpa::kWidgetHead;
  for (uint32_t o = part;; o += dpa::kPartSize) {
    if (bad[o] == dpa::kPartText) { bad[o + 2] = 0xff; bad[o + 3] = 0xff; break; }
  }
  MemSource src(bad.data(), bad.size(), false);
  if (dpa::validate(src)) { printf("FAIL corrupt widget block accepted\n"); return false; }
  // Without the flag the block is ignored (older firmware behaviour) and the file still plays.
  std::vector<uint8_t> noflag = file;
  noflag[26] = 0;
  MemSource src2(noflag.data(), noflag.size(), false);
  if (!dpa::validate(src2)) { printf("FAIL file without widget flag rejected\n"); return false; }
  printf("ok   corrupt widget block rejected, unflagged block ignored\n");
  return true;
}

int main(int argc, char** argv) {
  const std::string dir = argc > 1 ? argv[1] : "shared/test-vectors";
  bool ok = rgbCase(dir);
  ok = monoCase(dir) && ok;
  ok = rejectsCorrupt(dir) && ok;
  printf(ok ? "all passed\n" : "FAILED\n");
  return ok ? 0 : 1;
}
