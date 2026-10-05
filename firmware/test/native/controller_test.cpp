#include <assert.h>
#include <stdio.h>
#include "app/controller.h"
#include "app/commands.h"
#include "app/settings.h"
#include "app/app.h"
#include "storage/storage.h"

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
  printf("ok   brightness only changes after successful persistence\n");

  // Every settings command must reach settingsApply (which completes the receipt); a command the
  // controller forgets to route leaves the client waiting for a receipt that never comes.
  for (Cmd type : {Cmd::SaveDisplay, Cmd::SaveWifi, Cmd::ForgetWifi, Cmd::SavePlaylist, Cmd::SaveName, Cmd::SetTime}) {
    const auto id = commandPostConfirmed(type, "x", 1);
    controllerLoop();
    assert(commandRead(id, result) && result.state != UploadState::Pending);
  }
  printf("ok   settings commands are routed and complete their receipt\n");

  const char names[] = "idle\0renamed";
  const auto renamed = commandPostConfirmed(Cmd::Rename, names, sizeof(names));
  controllerLoop();
  assert(commandRead(renamed, result) && result.state == UploadState::Saved);
  storage::nativeRenameSucceeds = false;
  const auto refused = commandPostConfirmed(Cmd::Rename, names, sizeof(names));
  controllerLoop();
  assert(commandRead(refused, result) && result.state == UploadState::Failed);
  printf("ok   rename completes its receipt (saved / failed)\nall passed\n");
}
