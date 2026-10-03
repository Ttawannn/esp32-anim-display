#include "api.h"

#include <LittleFS.h>

#include "app/app.h"
#include "app/commands.h"
#include "board.h"
#include "display/presets.h"
#include "player/dpa.h"
#include "player/source.h"
#include "player/validation.h"
#include "player/playlist.h"
#include "storage/storage.h"
#include "wifi_manager.h"

static constexpr size_t kUploadMargin = 8 * 1024;  // LittleFS metadata headroom

static int fail(JsonDocument& out, int code, const char* msg) {
  out["error"] = msg;
  return code;
}

static int ok(JsonDocument& out) {
  out["ok"] = true;
  return 200;
}

static int enqueue(JsonDocument& out, Cmd type, const char* name = "", int value = 0) {
  if (!appPanelOk() && (type == Cmd::Play || type == Cmd::Next || type == Cmd::TestPattern || type == Cmd::Brightness))
    return fail(out, 503, "display unavailable");
  return commandPost(type, name, value) ? ok(out) : fail(out, 503, "command queue full");
}

// ---------------------------------------------------------------------------------------------

static void info(JsonDocument& doc) {
  doc["version"] = FIRMWARE_VERSION;
  doc["board"] = BOARD_ID;
  doc["board_name"] = BOARD_NAME;
  doc["chip"] = ESP.getChipModel();
  doc["heap_free"] = ESP.getFreeHeap();
  doc["heap_min"] = ESP.getMinFreeHeap();
  doc["uptime_s"] = millis() / 1000;

  const DisplayConfig& cfg = appConfig();
  const Preset& p = kPresets[cfg.preset];
  Panel* panel = appPanel();
  JsonObject d = doc["display"].to<JsonObject>();
  d["ok"] = appPanelOk();
  if (!appPanelOk() && panel && panel->error()) d["error"] = panel->error();
  d["preset"] = p.id;
  d["name"] = p.name;
  d["width"] = appPanelOk() ? panel->width() : p.width;
  d["height"] = appPanelOk() ? panel->height() : p.height;
  d["color"] = p.driver == Driver::I2cMonoPage ? "mono" : "rgb565";
  d["shape"] = p.round ? "round" : "rect";
  d["brightness"] = cfg.brightness;

  JsonObject fs = doc["fs"].to<JsonObject>();
  fs["total"] = storage::totalBytes();
  fs["used"] = storage::usedBytes();
  fs["free"] = storage::freeBytes();

  JsonObject w = doc["wifi"].to<JsonObject>();
  w["mode"] = wifi::isAP() ? "ap" : "sta";
  w["ssid"] = wifi::ssid();
  w["ip"] = wifi::ip();
  w["rssi"] = wifi::rssi();
  w["hostname"] = String(wifi::hostname()) + ".local";

  const PlayerStatus s = statusRead();
  JsonObject pl = doc["player"].to<JsonObject>();
  pl["name"] = s.name;
  pl["playing"] = s.playing;
  pl["live"] = s.live;
  pl["playlist"] = s.playlist;
  pl["frame"] = s.frame;
  pl["frames"] = s.frames;
  pl["fps"] = s.fps;
}

static void listAnims(JsonDocument& doc) {
  JsonArray arr = doc["anims"].to<JsonArray>();
  for (const auto& a : storage::list()) {
    JsonObject o = arr.add<JsonObject>();
    o["name"] = a.name;
    o["size"] = a.size;
    o["width"] = a.width;
    o["height"] = a.height;
    o["frames"] = a.frames;
    o["color"] = a.colorMode == dpa::kColorMono ? "mono" : "rgb565";
  }
  doc["free"] = storage::freeBytes();
}

static void displayJson(JsonObject d) {
  const DisplayConfig& cfg = appConfig();
  d["preset"] = kPresets[cfg.preset].id;
  d["rotation"] = cfg.rotation;
  d["offset_x"] = cfg.offX;
  d["offset_y"] = cfg.offY;
  d["invert"] = cfg.invert;
  d["bgr"] = cfg.bgr;
  d["mirror_x"] = cfg.mirrorX;
  d["spi_hz"] = cfg.spiHz;
  d["spi_mode"] = cfg.spiMode;
  d["i2c_hz"] = cfg.i2cHz;
  d["i2c_addr"] = cfg.i2cAddr;
  d["brightness"] = cfg.brightness;
  JsonObject pins = d["pins"].to<JsonObject>();
  pins["clk"] = cfg.pins.clk;
  pins["data"] = cfg.pins.data;
  pins["cs"] = cfg.pins.cs;
  pins["dc"] = cfg.pins.dc;
  pins["rst"] = cfg.pins.rst;
  pins["bl"] = cfg.pins.bl;
}

static int saveDisplay(JsonVariantConst json, JsonDocument& out) {
  DisplayConfig cfg = appConfig();
  if (json["preset"].is<const char*>()) {
    const int idx = findPreset(json["preset"]);
    if (idx < 0) return fail(out, 400, "unknown preset");
    if (idx != cfg.preset) configApplyPreset(cfg, idx);  // reset tuning when switching panels
  }
  if (json["rotation"].is<int>()) cfg.rotation = json["rotation"].as<int>() & 3;
  if (json["offset_x"].is<int>()) cfg.offX = json["offset_x"];
  if (json["offset_y"].is<int>()) cfg.offY = json["offset_y"];
  if (json["invert"].is<bool>()) cfg.invert = json["invert"];
  if (json["bgr"].is<bool>()) cfg.bgr = json["bgr"];
  if (json["mirror_x"].is<bool>()) cfg.mirrorX = json["mirror_x"];
  if (json["spi_hz"].is<uint32_t>()) cfg.spiHz = constrain(json["spi_hz"].as<uint32_t>(), 1000000u, 80000000u);
  if (json["spi_mode"].is<int>()) cfg.spiMode = json["spi_mode"].as<int>() & 3;
  if (json["i2c_hz"].is<uint32_t>()) cfg.i2cHz = constrain(json["i2c_hz"].as<uint32_t>(), 100000u, 1000000u);
  if (json["i2c_addr"].is<int>()) cfg.i2cAddr = json["i2c_addr"];
  if (json["brightness"].is<int>()) cfg.brightness = constrain(json["brightness"].as<int>(), 0, 255);
  if (json["pins"].is<JsonObjectConst>()) {
    JsonObjectConst p = json["pins"];
    auto pin = [&](const char* k, int8_t& v) { if (p[k].is<int>()) v = constrain(p[k].as<int>(), -1, 48); };
    pin("clk", cfg.pins.clk);
    pin("data", cfg.pins.data);
    pin("cs", cfg.pins.cs);
    pin("dc", cfg.pins.dc);
    pin("rst", cfg.pins.rst);
    pin("bl", cfg.pins.bl);
  }
  configSave(cfg);
  return enqueue(out, Cmd::Reboot);  // the panel is re-created at boot
}

static void presets(JsonDocument& doc) {
  JsonArray arr = doc["presets"].to<JsonArray>();
  for (size_t i = 0; i < kPresetCount; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["id"] = kPresets[i].id;
    o["name"] = kPresets[i].name;
    o["width"] = kPresets[i].width;
    o["height"] = kPresets[i].height;
    o["color"] = kPresets[i].driver == Driver::I2cMonoPage ? "mono" : "rgb565";
    o["round"] = kPresets[i].round;
  }
}

// ---------------------------------------------------------------------------------------------

int apiHandle(const String& method, const String& path, const ApiParams& params, JsonVariantConst body,
              JsonDocument& out) {
  const bool get = method == "GET", post = method == "POST", del = method == "DELETE";
  const bool put = method == "PUT" || post;  // JSON updates accept PUT or POST

  if (path == "/api/info" && get) return info(out), 200;
  if (path == "/api/uploads/status" && get) {
    UploadResult result;
    const String raw = params("id");
    if (!uploadRead(strtoul(raw.c_str(), nullptr, 10), result)) return fail(out, 404, "upload not found");
    out["state"] = result.state == UploadState::Pending ? "pending" :
                   result.state == UploadState::Saved ? "saved" : "failed";
    if (result.state == UploadState::Failed) out["error"] = "cannot save file";
    return 200;
  }

  if (path == "/api/anims") {
    if (get) return listAnims(out), 200;
    if (del) {
      const String name = storage::sanitizeName(params("name"));
      if (name.isEmpty() || !storage::exists(name)) return fail(out, 404, "not found");
      return enqueue(out, Cmd::Delete, name.c_str());
    }
  }

  if (path == "/api/play" && post) {
    const String name = storage::sanitizeName(params("name"));
    if (name.isEmpty() || !storage::exists(name)) return fail(out, 404, "not found");
    return enqueue(out, Cmd::Play, name.c_str());
  }
  if (path == "/api/stop" && post) return enqueue(out, Cmd::Stop);
  if (path == "/api/next" && post) return enqueue(out, Cmd::Next);
  if (path == "/api/live/end" && post) return enqueue(out, Cmd::LiveEnd);

  if (path == "/api/playlist") {
    if (get) {
      Playlist pl;
      playlistLoad(pl);
      playlistToJson(pl, out.to<JsonObject>());
      return 200;
    }
    if (put) {
      Playlist pl;
      if (!playlistFromJson(body, pl)) return fail(out, 400, "invalid playlist");
      if (!playlistSave(pl)) return fail(out, 500, "cannot save playlist");
      return enqueue(out, Cmd::ReloadPlaylist);
    }
  }

  if (path == "/api/display") {
    if (get) return displayJson(out.to<JsonObject>()), 200;
    if (put) return saveDisplay(body, out);
  }
  if (path == "/api/display/presets" && get) return presets(out), 200;
  if (path == "/api/display/test" && post) return enqueue(out, Cmd::TestPattern);
  if (path == "/api/brightness" && post) {
    return enqueue(out, Cmd::Brightness, "", constrain(params("value").toInt(), 0, 255));
  }

  if (path == "/api/wifi") {
    if (get) {
      out["mode"] = wifi::isAP() ? "ap" : "sta";
      out["ssid"] = wifi::ssid();
      out["ip"] = wifi::ip();
      out["rssi"] = wifi::rssi();
      out["saved_ssid"] = wifi::savedSsid();
      return 200;
    }
    if (del) {
      wifi::forgetCredentials();
      return enqueue(out, Cmd::Reboot);
    }
    if (put) {
      const String ssid = body["ssid"] | "";
      if (ssid.isEmpty() || ssid.length() > 32) return fail(out, 400, "invalid ssid");
      wifi::saveCredentials(ssid, body["password"] | "");
      return enqueue(out, Cmd::Reboot);
    }
  }
  if (path == "/api/wifi/scan" && get) return wifi::scanJson(out.to<JsonObject>()), 200;

  if (path == "/api/reboot" && post) return enqueue(out, Cmd::Reboot);

  return fail(out, 404, "not found");
}

// ---------------------------------------------------------------------------------------------

int apiBeginUpload(const String& rawName, size_t size, String& name, String& tmpPath, const char*& error) {
  name = storage::sanitizeName(rawName);
  if (name.isEmpty()) return error = "invalid file name", 400;
  const size_t available = storage::freeBytes(); // old file remains alongside the temporary file
  if (available < kUploadMargin || size > available - kUploadMargin) return error = "not enough storage", 507;
  tmpPath = storage::newUploadTmpPath();
  return 0;
}

int apiFinishUpload(const String& tmpPath, const String& name, bool play, uint32_t& uploadId, const char*& error) {
  // Validate before replacing anything.
  File f = LittleFS.open(tmpPath, "r");
  FileSource src(f);
  const bool valid = f && dpa::validate(src);
  f.close();
  if (!valid) {
    LittleFS.remove(tmpPath);
    return error = "not a valid .dpa file", 415;
  }
  // The loop task renames it into place (it may be the file currently playing).
  uploadId = uploadBegin();
  auto* path = (uint8_t*)strdup(tmpPath.c_str());
  if (!uploadId || !path || !commandPost(Cmd::CommitUpload, name.c_str(), play ? 1 : 0,
                                        path, tmpPath.length() + 1, uploadId)) {
    if (!uploadId || !path) free(path);
    uploadComplete(uploadId, false);
    LittleFS.remove(tmpPath);
    return error = "command queue full", 503;
  }
  return 0;
}

int apiLiveFrame(uint8_t* data, size_t len, const char*& error) {
  if (!appPanelOk()) { free(data); return error = "display unavailable", 503; }
  MemSource src(data, len, false);
  if (len > kMaxLiveBytes || !dpa::validate(src, true)) {
    free(data);
    return error = "not a valid .dpa file", 415;
  }
  if (!commandPost(Cmd::Live, "", 0, data, len)) return error = "command queue full", 503;
  return 0;
}
