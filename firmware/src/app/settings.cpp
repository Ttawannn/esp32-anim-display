#include "settings.h"
#include <ArduinoJson.h>
#include "app.h"
#include "clock.h"
#include "config.h"
#include "net/wifi_manager.h"
#include "player/playlist.h"

static uint32_t rebootReceipt = 0, rebootQueuedAt = 0;

bool isSettingsCommand(Cmd type) {
  return type == Cmd::SaveDisplay || type == Cmd::SavePlaylist || type == Cmd::SaveWifi || type == Cmd::ForgetWifi ||
         type == Cmd::SaveName || type == Cmd::SetTime;
}

bool settingsApply(const Command& c) {
  bool saved = false, reboot = false;
  const char* error = "cannot save settings";
  switch (c.type) {
    case Cmd::SaveDisplay:
      if (c.len == sizeof(DisplayConfig)) saved = configSave(*(const DisplayConfig*)c.data);
      reboot = true;
      break;
    case Cmd::SavePlaylist: {
      JsonDocument doc;
      Playlist pl;
      if (!deserializeJson(doc, (const char*)c.data, c.len) && playlistFromJson(doc.as<JsonVariantConst>(), pl))
        saved = playlistSave(pl);
      error = "cannot save playlist";
      break;
    }
    case Cmd::SaveWifi:
      if (c.len == sizeof(WifiCredentials)) {
        const auto& credentials = *(const WifiCredentials*)c.data;
        saved = wifi::saveCredentials(credentials.ssid, credentials.password);
      }
      reboot = true;
      break;
    case Cmd::ForgetWifi:
      saved = wifi::forgetCredentials();
      reboot = true;
      break;
    case Cmd::SaveName:
      saved = wifi::saveName(String((const char*)c.data, c.len));
      break;
    case Cmd::SetTime:
      if (c.len == sizeof(TimeSetting)) {
        const auto& t = *(const TimeSetting*)c.data;
        saved = clockSet(t.epoch, t.tzMinutes);
      }
      error = "invalid time";
      break;
    default: return false;
  }
  uploadComplete(c.uploadId, saved, error);
  if (saved && reboot) { rebootReceipt = c.uploadId; rebootQueuedAt = millis(); }
  return saved;
}

void settingsPoll() {
  if (!rebootReceipt || (!commandAcknowledged(rebootReceipt) && millis() - rebootQueuedAt < 3000)) return;
  delay(400); // allow the final HTTP/USB receipt response to leave the board
  ESP.restart();
}
