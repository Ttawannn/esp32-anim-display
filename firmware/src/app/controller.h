#pragma once
#include <Arduino.h>

#include "display/panel.h"
#include "player/player.h"

// Decides what is on screen: playlist / last animation, live preview from the editor,
// temporary overlays (info, test pattern) and the idle info screen. Runs on the loop task.
void controllerBegin(Panel* panel);
void controllerLoop();  // executes queued commands and drives the player

void controllerPlay(const String& name);
void controllerStop();
void controllerNext();
void controllerShowInfo(uint32_t ms);
void controllerResume();  // after something else (e.g. a benchmark) drew on the panel
Player& controllerPlayer();
