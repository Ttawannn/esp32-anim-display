#include "playlist.h"

#include <LittleFS.h>

#include "storage/storage.h"

static constexpr const char* kPath = "/playlist.json";
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
  File f = LittleFS.open(kPath, "w");
  if (!f) return false;
  return serializeJson(doc, f) > 0;
}
