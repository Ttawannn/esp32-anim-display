#pragma once
#include <Arduino.h>
#include <vector>
struct PlaylistItem { String name; uint16_t seconds; };
struct Playlist { bool enabled = false, shuffle = false; std::vector<PlaylistItem> items; };
inline bool playlistLoad(Playlist&) { return true; }
