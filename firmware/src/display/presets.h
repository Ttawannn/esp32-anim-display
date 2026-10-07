#pragma once
#include <stddef.h>
#include <stdint.h>

enum class Driver : uint8_t {
  SpiRgb565,    // ST7735 / ST7789 / GC9A01 family: CASET/RASET/RAMWR, 16-bit pixels over SPI + DMA
  I2cMonoPage,  // SSD1306 / SH1106 family: 1 bit per pixel, written page by page (8 rows) over I2C
};

// Init sequences are byte streams of records:
//   cmd, argc [| INIT_DELAY], args[argc], [delay_ms if INIT_DELAY; 255 = 500 ms]
// For I2C mono panels every byte (cmd and args) is sent as a command byte.
constexpr uint8_t INIT_DELAY = 0x80;

struct Preset {
  const char* id;
  const char* name;
  Driver driver;
  uint16_t width, height;  // visible area at rotation 0 (the module's upright side, see `turn`)
  uint16_t ctrlW, ctrlH;   // controller RAM size (used to compute offsets for rotations 2/3)
  int16_t offX, offY;      // visible area offset inside controller RAM at controller rotation 0
  bool invert;             // SPI: send INVON. Mono: inverse display
  bool bgr;                // SPI: BGR subpixel order
  bool mirrorX;            // SPI: XOR MADCTL.MX (panels mounted mirrored, e.g. GC9A01)
  bool round;
  uint8_t spiMode;
  uint32_t spiHz;
  uint32_t i2cHz;
  uint8_t i2cAddr;
  const uint8_t* init;
  size_t initLen;
  // SPI: controller rotation (MADCTL) used for rotation 0, so rotation 0 is the side where the
  // module's silkscreen reads upright. Rotations are counted from there.
  uint8_t turn = 0;
};

extern const Preset kPresets[];
extern const size_t kPresetCount;

int findPreset(const char* id);
