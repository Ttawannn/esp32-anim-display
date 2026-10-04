#pragma once
#include "config.h"
#include "display/panel.h"

#define FIRMWARE_VERSION "0.3.0"

// Shared app state owned by main.cpp.
DisplayConfig& appConfig();
Panel* appPanel();
bool appPanelOk();
