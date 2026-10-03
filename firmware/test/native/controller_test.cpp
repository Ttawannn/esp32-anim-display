#include <assert.h>
#include <stdio.h>
#include "app/controller.h"
#include "app/commands.h"
#include "app/settings.h"
#include "app/app.h"

static DisplayConfig cfg;
DisplayConfig& appConfig() { return cfg; }
bool settingsApply(const Command& c) { uploadComplete(c.uploadId, false, "cannot save playlist"); return false; }
void screenInfo(Panel&) {}
void screenMessage(Panel&, const char*, const char*) {}

int main() {
  commandsBegin();
  Panel panel;
  controllerBegin(&panel);
  assert(controllerPlayer().active());
  controllerShowInfo(10000);
  assert(commandPost(Cmd::Stop));
  controllerLoop();
  const int plays = nativePlays;
  nativeNow += 20000;
  controllerLoop();
  assert(!controllerPlayer().active() && nativePlays == plays && !statusRead().playing);
  printf("ok   stop during overlay stays stopped after its original deadline\n");

  nativeConfigSave = false;
  const auto failed = commandPostConfirmed(Cmd::Brightness, nullptr, 0, 42);
  controllerLoop();
  UploadResult result;
  assert(commandRead(failed, result) && result.state == UploadState::Failed);
  assert(cfg.brightness == 255 && panel.brightness == 255);
  nativeConfigSave = true;
  const auto saved = commandPostConfirmed(Cmd::Brightness, nullptr, 0, 42);
  controllerLoop();
  assert(commandRead(saved, result) && result.state == UploadState::Saved);
  assert(cfg.brightness == 42 && panel.brightness == 42);
  printf("ok   brightness only changes after successful persistence\nall passed\n");
}
