#include "bench.h"

#include <Arduino.h>
#include <JPEGDEC.h>

#include "display/gfx.h"
#include "test_jpeg.h"

BenchResults gBench;

struct JpegCtx {
  Panel* panel;  // nullptr = decode only
  int16_t ox, oy;
};

static int jpegDraw(JPEGDRAW* d) {
  auto* ctx = static_cast<JpegCtx*>(d->pUser);
  if (ctx->panel) ctx->panel->pushRect(ctx->ox + d->x, ctx->oy + d->y, d->iWidth, d->iHeight, d->pPixels);
  return 1;
}

// Average ms per decode over `runs`, or -1 on error.
static float timeJpeg(JPEGDEC& jpeg, JpegCtx& ctx, int runs) {
  const uint32_t start = micros();
  for (int i = 0; i < runs; i++) {
    if (!jpeg.openRAM((uint8_t*)kTestJpeg240, kTestJpeg240Len, jpegDraw)) return -1;
    jpeg.setUserPointer(&ctx);
    jpeg.setPixelType(RGB565_LITTLE_ENDIAN);
    if (!jpeg.decode(0, 0, 0)) {
      jpeg.close();
      return -1;
    }
    jpeg.close();
  }
  if (ctx.panel) ctx.panel->flush();
  return (micros() - start) / 1000.0f / runs;
}

void benchRun(Panel& p) {
  const int16_t w = p.width(), h = p.height();
  const bool mono = p.colorMode() == ColorMode::Mono;
  const size_t frameBytes = mono ? (size_t)w * h / 8 : (size_t)w * h * 2;

  // 1. Bus throughput
  const int fills = mono ? 40 : 30;
  static constexpr uint16_t kColors[] = {color::Red, color::Black, color::Blue, color::White, color::Green};
  uint32_t start = micros();
  for (int i = 0; i < fills; i++) {
    p.fillScreen(kColors[i % 5]);
    p.flush();
  }
  float sec = (micros() - start) / 1e6f;
  gBench.fillFps = fills / sec;
  gBench.fillKBps = frameBytes * fills / sec / 1024;

  // 2. CPU render + push
  const int frames = 20;
  start = micros();
  for (int i = 0; i < frames; i++) {
    gfxPlasmaFrame(p, i * 4);
    p.flush();
  }
  gBench.plasmaFps = frames / ((micros() - start) / 1e6f);

  // 3. JPEG (JPEGDEC object is ~17 KB, keep it off the stack and free it afterwards)
  JPEGDEC* jpeg = new JPEGDEC();
  JpegCtx ctx{nullptr, (int16_t)((w - 240) / 2), (int16_t)((h - 240) / 2)};
  gBench.jpegDecodeMs = timeJpeg(*jpeg, ctx, 10);
  p.fillScreen(color::Black);
  ctx.panel = &p;
  gBench.jpegDrawMs = timeJpeg(*jpeg, ctx, 10);
  delete jpeg;

  gBench.ran = true;
  delay(1500);  // leave the decoded image up for a moment
}

void benchPrint() {
  if (!gBench.ran) {
    Serial.println("bench: not run yet (type 'bench')");
    return;
  }
  Serial.printf("bench: fill      %6.1f fps  (%.0f KB/s)\n", gBench.fillFps, gBench.fillKBps);
  Serial.printf("bench: plasma    %6.1f fps  (CPU render + push)\n", gBench.plasmaFps);
  Serial.printf("bench: jpeg240   %6.1f ms decode, %.1f ms decode+draw (%.1f fps)\n", gBench.jpegDecodeMs,
                gBench.jpegDrawMs, gBench.jpegDrawMs > 0 ? 1000 / gBench.jpegDrawMs : 0);
}
