// Native (PC) test: decodes the shared test vectors written by the web encoder with the same
// decoder the firmware uses, and compares every frame with the expected pixels.
//
// Build & run (from the repo root):
//   python -m ziglang c++ -std=c++17 -O1 -Ifirmware/src firmware/test/native/decode_test.cpp -o build/decode_test.exe
//   build/decode_test.exe shared/test-vectors
//
// (cd web && npm test) regenerates the vectors.

#include <stdio.h>

#include <string>
#include <vector>

#include "player/decoder.h"

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

static bool runCase(const std::string& dir, const char* name) {
  std::vector<uint8_t> file = readFile(dir + "/" + name + ".dpa");
  std::vector<uint8_t> expected = readFile(dir + "/" + name + ".expected");
  if (file.empty() || expected.empty()) {
    printf("FAIL %s: vector files missing (run npm test in web/)\n", name);
    return false;
  }
  MemSource src(file.data(), file.size(), false);

  dpa::Header h;
  if (!dpa::parseHeader(file.data(), file.size(), h)) {
    printf("FAIL %s: header\n", name);
    return false;
  }
  uint16_t palette[256] = {0};
  for (uint16_t i = 0; i < h.paletteSize; i++) palette[i] = dpa::rd16(&file[dpa::kHeaderSize + i * 2]);

  const size_t px = (size_t)h.canvasW * h.canvasH;
  if (expected.size() != px * 2 * h.frameCount) {
    printf("FAIL %s: expected size mismatch\n", name);
    return false;
  }
  std::vector<uint16_t> canvas(px, 0);
  std::vector<uint8_t> scratch(h.canvasW);
  std::vector<uint16_t> rowPx(h.canvasW);

  for (uint16_t i = 0; i < h.frameCount; i++) {
    const dpa::FrameEntry e = dpa::parseEntry(&file[h.tableOffset + i * dpa::kEntrySize]);
    dpa::Rect r;
    bool ok = dpa::readRect(src, e, r);
    if (ok && e.type == dpa::kFrameIndexed) {
      ok = dpa::decodeIndexed(src, e, h, r, palette, scratch.data(), rowPx.data(), [&](uint16_t y, const uint16_t* row) {
        for (uint16_t c = 0; c < r.w; c++) canvas[y * h.canvasW + r.x + c] = row[c];
      });
    } else if (ok && e.type == dpa::kFrameMono) {
      ok = dpa::decodeMono(src, e, h, r, scratch.data(), [&](uint16_t page, const uint8_t* bytes) {
        for (uint8_t b = 0; b < 8; b++) {
          const uint16_t y = page * 8 + b;
          if (y >= h.canvasH) continue;
          for (uint16_t c = 0; c < r.w; c++) canvas[y * h.canvasW + r.x + c] = (bytes[c] >> b) & 1 ? 0xFFFF : 0;
        }
      });
    } else if (ok) {
      printf("SKIP %s frame %u: type %u\n", name, i, e.type);
      continue;
    }
    if (!ok) {
      printf("FAIL %s frame %u: decode error\n", name, i);
      return false;
    }
    const uint8_t* want = &expected[i * px * 2];
    for (size_t k = 0; k < px; k++) {
      const uint16_t w = want[k * 2] | (want[k * 2 + 1] << 8);
      if (canvas[k] != w) {
        printf("FAIL %s frame %u pixel (%zu,%zu): got %04X want %04X\n", name, i, k % h.canvasW, k / h.canvasW,
               canvas[k], w);
        return false;
      }
    }
  }
  printf("ok   %s: %u frames %ux%u x%u, %zu bytes\n", name, h.frameCount, h.canvasW, h.canvasH, h.scale, file.size());
  return true;
}

int main(int argc, char** argv) {
  const std::string dir = argc > 1 ? argv[1] : "shared/test-vectors";
  const char* cases[] = {"indexed_delta", "indexed_many", "mono_pad", "mono_full"};
  int failed = 0;
  for (const char* c : cases) failed += !runCase(dir, c);
  printf(failed ? "%d FAILED\n" : "all passed\n", failed);
  return failed ? 1 : 0;
}
