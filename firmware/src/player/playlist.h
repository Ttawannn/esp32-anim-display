#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

#include <vector>

// Ordered list of animations played one after another. Stored in /playlist.json.
struct PlaylistItem {
  String name;
  uint16_t seconds;  // 0 = play the animation once (or its own loop count), then move on
};

struct Playlist {
  bool enabled = false;
  bool shuffle = false;
  std::vector<PlaylistItem> items;
};

bool playlistLoad(Playlist& pl);
bool playlistSave(const Playlist& pl);
bool playlistRecover();
void playlistToJson(const Playlist& pl, JsonObject out);
bool playlistFromJson(JsonVariantConst in, Playlist& pl);
