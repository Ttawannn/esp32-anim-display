#pragma once
#include "display/panel.h"

// Status screens drawn with the built-in 5x7 font.
void screenBoot(Panel& p, const char* status);
void screenInfo(Panel& p);  // how to connect: Wi-Fi name, password, address, storage
void screenMessage(Panel& p, const char* title, const char* line);
