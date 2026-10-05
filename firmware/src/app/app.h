#pragma once
#include "config.h"
#include "display/panel.h"

#define FIRMWARE_VERSION "0.5.0"

// Shared app state owned by main.cpp.
DisplayConfig& appConfig();
Panel* appPanel();
bool appPanelOk();
// False until the display settings have been saved once (the setup wizard runs until then).
bool appDisplayConfigured();
// First boot only: what an I2C probe on the default pins found ("oled" / "tft"), else nullptr.
const char* appDisplayDetected();
