#include "panel.h"

#include "panel_i2c_mono.h"
#include "panel_spi_rgb565.h"

Panel* createPanel(const DisplayConfig& cfg) {
  switch (kPresets[cfg.preset].driver) {
    case Driver::SpiRgb565: return new PanelSpiRgb565(cfg);
    case Driver::I2cMonoPage: return new PanelI2cMono(cfg);
  }
  return nullptr;
}
