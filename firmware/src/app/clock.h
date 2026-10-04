#pragma once
#include <Arduino.h>

#include "player/widgets.h"

// Wall-clock time for clock widgets. There is no RTC: the time comes from NTP when the board is on
// a network with internet, or from the browser (PUT /api/time) whenever the editor or the remote
// connects. The UTC offset is remembered in NVS. Call from the loop task only.
void clockBegin();
void clockStartNtp();                         // after joining Wi-Fi (station mode)
bool clockSet(uint32_t epoch, int tzMinutes);  // tzMinutes east of UTC, e.g. 420 for Thailand
dpa::ClockTime clockNow();                    // valid = false until the time is known
uint32_t clockEpoch();                        // 0 when unknown
int clockTzMinutes();

struct TimeSetting { uint32_t epoch; int16_t tzMinutes; };
