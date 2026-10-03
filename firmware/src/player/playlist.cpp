#include "playlist.h"

#include <LittleFS.h>

#include "storage/storage.h"
#include "storage/replace.h"

static constexpr const char* kPath = "/playlist.json";
static constexpr const char* kTmp = "/playlist.tmp";
static constexpr const char* kBackup = "/playlist.json.bak";
static constexpr size_t kMaxItems = 64;

void playlistToJson(const Playlist& pl, JsonObject out) {
  out["enabled"] = pl.enabled;
  out["shuffle"] = pl.shuffle;
  JsonArray items = out["items"].to<JsonArray>();
  for (const auto& it : pl.items) {
    JsonObject o = items.add<JsonObject>();
    o["name"] = it.name;
    o["seconds"] = it.seconds;
  }
}

bool playlistFromJson(JsonVariantConst in, Playlist& pl) {
  if (!in.is<JsonObjectConst>()) return false;
  Playlist next;
  next.enabled = in["enabled"] | false;
  next.shuffle = in["shuffle"] | false;
  for (JsonVariantConst v : in["items"].as<JsonArrayConst>()) {
    if (next.items.size() >= kMaxItems) break;
    const String name = storage::sanitizeName(v["name"] | "");
    if (name.isEmpty()) continue;
    next.items.push_back({name, (uint16_t)constrain((int)(v["seconds"] | 0), 0, 3600)});
  }
  pl = next;
  return true;
}

bool playlistLoad(Playlist& pl) {
  File f = LittleFS.open(kPath, "r");
  if (!f) return false;
  JsonDocument doc;
  if (deserializeJson(doc, f)) return false;
  return playlistFromJson(doc.as<JsonVariantConst>(), pl);
}

bool playlistSave(const Playlist& pl) {
  JsonDocument doc;
  playlistToJson(pl, doc.to<JsonObject>());
  const size_t expected = measureJson(doc);
  return storage::writeReplacement(LittleFS, String(kTmp), String(kPath), String(kBackup), expected,
    [&doc](File& f) { return serializeJson(doc, f); },
    [](const String& path) {
      File check = LittleFS.open(path, "r");
      JsonDocument verified;
      return check && !deserializeJson(verified, check);
    });
}

bool playlistRecover() {
  if (!storage::recoverReplacement(LittleFS, String(kPath), String(kBackup))) return false;
  if (LittleFS.exists(kTmp)) LittleFS.remove(kTmp);
  return true;
}
