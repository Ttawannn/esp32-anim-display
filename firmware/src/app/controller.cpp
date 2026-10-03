#include "controller.h"

#include <Preferences.h>

#include "app.h"
#include "commands.h"
#include "display/gfx.h"
#include "player/playlist.h"
#include "screens.h"
#include "storage/storage.h"

static constexpr uint32_t kLiveIdleTimeoutMs = 60000;
static constexpr uint32_t kOverlayMs = 10000;

static Panel* panel = nullptr;
static Player player;
static Playlist playlist;
static int plIndex = -1;
static uint32_t itemStart = 0;
static bool manual = false;        // an explicit "play" pauses the playlist until next/reload
static String resumeName;          // what to return to after live preview or an overlay
static uint32_t overlayUntil = 0;  // info / test screen on top, 0 = none
static uint32_t liveLastAt = 0;
static uint32_t statusAt = 0;

Player& controllerPlayer() { return player; }

static String lastPlayed() {
  Preferences p;
  p.begin("player", true);
  String s = p.getString("last", "");
  p.end();
  return s;
}

static void rememberLast(const String& name) {
  if (name == lastPlayed()) return;  // avoid needless flash writes
  Preferences p;
  p.begin("player", false);
  p.putString("last", name);
  p.end();
}

static void showIdle() {
  player.stop();
  screenInfo(*panel);
}

static bool playName(const String& name) {
  overlayUntil = 0;
  if (player.playFile(name)) return true;
  Serial.printf("play '%s' failed: %s\n", name.c_str(), player.error());
  return false;
}

static bool playlistActive() { return playlist.enabled && !playlist.items.empty() && !manual; }

// Plays item idx, skipping entries whose file is missing or broken.
static void playItem(int idx) {
  const int n = playlist.items.size();
  for (int tries = 0; tries < n; tries++) {
    const int i = (idx + tries) % n;
    if (playName(playlist.items[i].name)) {
      plIndex = i;
      itemStart = millis();
      return;
    }
  }
  plIndex = -1;
  showIdle();
}

static void nextItem() {
  const int n = playlist.items.size();
  int i = (plIndex + 1) % n;
  if (playlist.shuffle && n > 1) {
    do i = random(n); while (i == plIndex);
  }
  playItem(i);
}

static void startDefault() {
  if (playlistActive()) return playItem(0);
  const String last = lastPlayed();
  if (last.length() && storage::exists(last) && playName(last)) return;
  for (const auto& a : storage::list()) {
    if (playName(a.name)) return;
  }
  showIdle();
}

void controllerResume() {
  overlayUntil = 0;
  if (playlistActive() && plIndex >= 0) return playItem(plIndex);
  if (resumeName.length() && playName(resumeName)) return;
  startDefault();
}

void controllerPlay(const String& name) {
  manual = true;
  if (playName(name)) rememberLast(name);
}

void controllerStop() {
  manual = true;
  player.stop();
  resumeName = "";
  panel->fillScreen(color::Black);
  panel->flush();
}

void controllerNext() {
  if (playlist.enabled && !playlist.items.empty()) {
    manual = false;
    return nextItem();
  }
  const auto files = storage::list();
  if (files.empty()) return showIdle();
  size_t i = 0;
  for (size_t k = 0; k < files.size(); k++) {
    if (files[k].name == player.name()) i = (k + 1) % files.size();
  }
  controllerPlay(files[i].name);
}

static void beginOverlay() {
  if (player.active() && !player.isLive()) resumeName = player.name();
  player.stop();
}

void controllerShowInfo(uint32_t ms) {
  beginOverlay();
  screenInfo(*panel);
  overlayUntil = millis() + ms;
}

static void handle(Command& c) {
  const String name = c.name;
  switch (c.type) {
    case Cmd::Play:
      controllerPlay(name);
      break;
    case Cmd::Stop:
      controllerStop();
      break;
    case Cmd::Next:
      controllerNext();
      break;
    case Cmd::Delete: {
      const bool wasPlaying = player.name() == name;
      if (wasPlaying) player.stop();
      storage::remove(name);
      if (lastPlayed() == name) rememberLast("");
      if (wasPlaying) controllerNext();
      break;
    }
    case Cmd::CommitUpload: {
      if (player.name() == name) player.stop();
      const bool ok = commandCommitUpload(c);
      Serial.printf("upload '%s' %s\n", name.c_str(), ok ? "saved" : "FAILED to save");
      if (ok && c.value) {
        controllerPlay(name);
      } else if (!player.active() && !overlayUntil) {
        startDefault();
      }
      break;
    }
    case Cmd::Live:
      if (!player.isLive()) resumeName = player.active() ? player.name() : resumeName;
      overlayUntil = 0;
      player.playMemory(c.data, c.len);  // takes ownership, even on failure
      c.data = nullptr;
      liveLastAt = millis();
      break;
    case Cmd::LiveEnd:
      if (player.isLive()) controllerResume();
      break;
    case Cmd::TestPattern: {
      beginOverlay();
      const Preset& p = kPresets[appConfig().preset];
      gfxTestPattern(*panel, p.id, p.round);
      overlayUntil = millis() + kOverlayMs;
      break;
    }
    case Cmd::ShowInfo:
      controllerShowInfo(kOverlayMs);
      break;
    case Cmd::Brightness:
      panel->setBrightness(c.value);
      appConfig().brightness = c.value;
      configSave(appConfig());
      break;
    case Cmd::ReloadPlaylist:
      playlist = Playlist();
      playlistLoad(playlist);
      manual = false;
      plIndex = -1;
      if (playlistActive()) playItem(0);
      else if (!player.active()) startDefault();
      break;
    case Cmd::Reboot:
      screenMessage(*panel, "Rebooting...", nullptr);
      delay(400);  // let the HTTP response go out
      ESP.restart();
      break;
  }
  free(c.data);
}

void controllerBegin(Panel* p) {
  panel = p;
  player.begin(p);
  playlistLoad(playlist);
  startDefault();
}

void controllerLoop() {
  Command c;
  while (commandTake(c)) handle(c);

  const uint32_t now = millis();
  if (overlayUntil && (int32_t)(now - overlayUntil) >= 0) controllerResume();
  if (player.isLive() && now - liveLastAt > kLiveIdleTimeoutMs) controllerResume();  // editor went away

  if (!overlayUntil) player.tick();

  if (playlistActive() && plIndex >= 0 && player.active() && !player.isLive() && !overlayUntil) {
    const PlaylistItem& item = playlist.items[plIndex];
    const uint32_t elapsed = now - itemStart;
    const bool done = item.seconds ? elapsed >= item.seconds * 1000u : (player.finished() || player.loopsDone() >= 1);
    if (done) nextItem();
  }

  if (now - statusAt >= 250) {
    statusAt = now;
    PlayerStatus s{};
    strlcpy(s.name, player.name().c_str(), sizeof(s.name));
    s.playing = player.active() && !player.finished() && !overlayUntil;
    s.live = player.isLive();
    s.playlist = playlistActive();
    s.frame = player.frameIndex();
    s.frames = player.active() ? player.frameCount() : 0;
    s.fps = player.fps();
    statusPublish(s);
  }
}
