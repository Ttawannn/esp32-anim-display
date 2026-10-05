#pragma once
#include <Arduino.h>

// HTTP handlers run in the network task and must not touch the display or the player.
// They post commands here; the loop task executes them.

enum class Cmd : uint8_t {
  Play,           // name
  Stop,
  Next,
  Delete,         // name
  Rename,         // data: "<from>\0<to>\0", confirmed (receipt)
  CommitUpload,   // name, data = temp file path (C string), value = 1 to play afterwards
  Live,           // data/len: single-frame DPA in RAM (ownership passes to the loop)
  LiveEnd,
  TestPattern,
  ShowInfo,
  Brightness,     // value
  ReloadPlaylist,
  SaveDisplay,    // data: DisplayConfig
  SavePlaylist,   // data: normalized playlist JSON
  SaveWifi,       // data: WifiCredentials
  ForgetWifi,
  SaveName,       // data: board name (UTF-8, not NUL-terminated)
  SetTime,        // data: TimeSetting (app/clock.h)
  Reboot,
};

struct Command {
  Cmd type;
  char name[64];
  uint8_t* data;
  size_t len;
  int value;
  uint32_t uploadId;
};

void commandsBegin();
bool commandPost(Cmd type, const char* name = "", int value = 0, uint8_t* data = nullptr, size_t len = 0,
                 uint32_t uploadId = 0);
bool commandTake(Command& out);

enum class UploadState : uint8_t { Pending, Saved, Failed };
struct UploadResult { uint32_t id; UploadState state; const char* error = nullptr; bool acknowledged = false; };
uint32_t uploadBegin();  // 0 when all receipt slots are pending
bool uploadRead(uint32_t id, UploadResult& out);
void uploadComplete(uint32_t id, bool saved, const char* error = "cannot save file");
// Settings share the bounded receipt pool. Reading a completed receipt permits reboot.
uint32_t commandPostConfirmed(Cmd type, const void* data = nullptr, size_t len = 0, int value = 0);
bool commandRead(uint32_t id, UploadResult& out);
bool commandAcknowledged(uint32_t id);
// Called only by the loop task, including when the panel failed to initialise.
bool commandCommitUpload(const Command& c);

// Snapshot of player state for /api/info (written by the loop, read by HTTP handlers).
struct PlayerStatus {
  char name[64];
  bool playing;
  bool live;
  bool playlist;
  uint16_t frame;
  uint16_t frames;
  float fps;
};

void statusPublish(const PlayerStatus& s);
PlayerStatus statusRead();
