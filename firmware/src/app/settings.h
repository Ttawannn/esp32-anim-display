#pragma once
#include "commands.h"

struct WifiCredentials { char ssid[33]; char password[65]; };
bool isSettingsCommand(Cmd type);
bool settingsApply(const Command& c); // loop task only; completes its receipt
void settingsPoll(); // reboot after the client reads the saved receipt (or 3 seconds)
