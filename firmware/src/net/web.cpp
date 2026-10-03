#include "web.h"

#include <ArduinoJson.h>
#include <AsyncJson.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>

#include "app/app.h"
#include "app/commands.h"
#include "board.h"
#include "display/presets.h"
#include "player/dpa.h"
#include "player/playlist.h"
#include "storage/storage.h"
#include "web_assets.h"
#include "wifi_manager.h"

static AsyncWebServer server(80);
static constexpr size_t kMaxLiveBytes = 96 * 1024;
static constexpr size_t kUploadMargin = 8 * 1024;  // LittleFS metadata headroom

static AsyncURIMatcher exact(const char* uri) { return AsyncURIMatcher::exact(uri); }

static void sendJson(AsyncWebServerRequest* req, const JsonDocument& doc, int code = 200) {
  String out;
  serializeJson(doc, out);
  req->send(code, "application/json", out);
}

static void sendError(AsyncWebServerRequest* req, int code, const char* msg) {
  JsonDocument doc;
  doc["error"] = msg;
  sendJson(req, doc, code);
}

static void sendOk(AsyncWebServerRequest* req) { req->send(200, "application/json", "{\"ok\":true}"); }

static String param(AsyncWebServerRequest* req, const char* name) {
  return req->hasParam(name) ? req->getParam(name)->value() : String();
}

// ---------------------------------------------------------------------------------------------
// GET /api/info

static void handleInfo(AsyncWebServerRequest* req) {
  JsonDocument doc;
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
  sendJson(req, doc);
}

// ---------------------------------------------------------------------------------------------
// Animations: list, upload, delete, play

static void handleList(AsyncWebServerRequest* req) {
  JsonDocument doc;
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
  sendJson(req, doc);
}

// Per-request upload state, freed by the server with the request.
struct UploadState {
  int code;  // 0 = ok
  char error[64];
  char name[64];
  char tmp[48];
  bool play;
  size_t written;
};

static void handleUploadChunk(AsyncWebServerRequest* req, const String& filename, size_t index, uint8_t* data,
                              size_t len, bool final) {
  auto* st = static_cast<UploadState*>(req->_tempObject);
  if (index == 0) {
    st = static_cast<UploadState*>(calloc(1, sizeof(UploadState)));
    req->_tempObject = st;
    if (!st) return;
    const String name = storage::sanitizeName(param(req, "name").length() ? param(req, "name") : filename);
    strlcpy(st->name, name.c_str(), sizeof(st->name));
    st->play = param(req, "play") != "0";
    auto fail = [&](int code, const char* msg) { st->code = code; strlcpy(st->error, msg, sizeof(st->error)); };
    if (name.isEmpty()) return fail(400, "invalid file name");
    const size_t available = storage::freeBytes() + storage::fileSize(name);
    if (req->contentLength() + kUploadMargin > available) return fail(507, "not enough storage");
    strlcpy(st->tmp, storage::newUploadTmpPath().c_str(), sizeof(st->tmp));
    req->_tempFile = LittleFS.open(st->tmp, "w");
    if (!req->_tempFile) return fail(500, "cannot create file");
  }
  if (!st || st->code) return;
  if (len && req->_tempFile.write(data, len) != len) {
    st->code = 507;
    strlcpy(st->error, "write failed (storage full?)", sizeof(st->error));
    req->_tempFile.close();
    LittleFS.remove(st->tmp);
    return;
  }
  st->written += len;
  if (final) {
    req->_tempFile.close();
    // Validate before replacing anything.
    File f = LittleFS.open(st->tmp, "r");
    uint8_t hb[dpa::kHeaderSize];
    dpa::Header h;
    const bool valid = f && f.read(hb, sizeof(hb)) == sizeof(hb) && dpa::parseHeader(hb, sizeof(hb), h);
    f.close();
    if (!valid) {
      st->code = 415;
      strlcpy(st->error, "not a valid .dpa file", sizeof(st->error));
      LittleFS.remove(st->tmp);
      return;
    }
    // The loop task renames it into place (it may be the file currently playing).
    commandPost(Cmd::CommitUpload, st->name, st->play ? 1 : 0, (uint8_t*)strdup(st->tmp), strlen(st->tmp) + 1);
  }
}

static void handleUploadDone(AsyncWebServerRequest* req) {
  auto* st = static_cast<UploadState*>(req->_tempObject);
  if (!st) return sendError(req, 400, "no file received");
  if (st->code) return sendError(req, st->code, st->error);
  JsonDocument doc;
  doc["ok"] = true;
  doc["name"] = st->name;
  doc["size"] = st->written;
  sendJson(req, doc);
}

// POST /api/live: raw single-frame DPA in the body, shown immediately (editor live preview).
static void handleLiveBody(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
  if (index == 0) {
    if (total > kMaxLiveBytes || total < dpa::kHeaderSize || ESP.getMaxAllocHeap() < total + 16 * 1024) return;
    req->_tempObject = malloc(total);
  }
  if (!req->_tempObject) return;
  memcpy(static_cast<uint8_t*>(req->_tempObject) + index, data, len);
  if (index + len == total) {
    commandPost(Cmd::Live, "", 0, static_cast<uint8_t*>(req->_tempObject), total);
    req->_tempObject = calloc(1, 1);  // buffer now owned by the loop task; non-null marks success
  }
}

// ---------------------------------------------------------------------------------------------
// Display settings

static void displayToJson(JsonObject d) {
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

static void handleDisplayPut(AsyncWebServerRequest* req, JsonVariant& json) {
  DisplayConfig cfg = appConfig();
  if (json["preset"].is<const char*>()) {
    const int idx = findPreset(json["preset"]);
    if (idx < 0) return sendError(req, 400, "unknown preset");
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
  if (json["pins"].is<JsonObject>()) {
    JsonObject p = json["pins"];
    auto pin = [&](const char* k, int8_t& v) { if (p[k].is<int>()) v = constrain(p[k].as<int>(), -1, 48); };
    pin("clk", cfg.pins.clk);
    pin("data", cfg.pins.data);
    pin("cs", cfg.pins.cs);
    pin("dc", cfg.pins.dc);
    pin("rst", cfg.pins.rst);
    pin("bl", cfg.pins.bl);
  }
  configSave(cfg);
  sendOk(req);
  commandPost(Cmd::Reboot);  // the panel is re-created at boot
}

// ---------------------------------------------------------------------------------------------

static void serveAsset(const WebAsset& a) {
  server.on(exact(a.path), HTTP_GET, [&a](AsyncWebServerRequest* req) {
    AsyncWebServerResponse* res = req->beginResponse(200, a.type, a.data, a.len);
    res->addHeader("Content-Encoding", "gzip");
    res->addHeader("Cache-Control", a.immutable ? "public, max-age=31536000, immutable" : "no-cache");
    req->send(res);
  });
}

void webBegin() {
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type");

  for (const WebAsset& a : kWebAssets) serveAsset(a);

  server.on(exact("/api/info"), HTTP_GET, handleInfo);

  server.on(exact("/api/anims"), HTTP_GET, handleList);
  server.on(exact("/api/anims"), HTTP_POST, handleUploadDone, handleUploadChunk);
  server.on(exact("/api/anims"), HTTP_DELETE, [](AsyncWebServerRequest* req) {
    const String name = storage::sanitizeName(param(req, "name"));
    if (name.isEmpty() || !storage::exists(name)) return sendError(req, 404, "not found");
    commandPost(Cmd::Delete, name.c_str());
    sendOk(req);
  });

  server.on(exact("/api/play"), HTTP_POST, [](AsyncWebServerRequest* req) {
    const String name = storage::sanitizeName(param(req, "name"));
    if (name.isEmpty() || !storage::exists(name)) return sendError(req, 404, "not found");
    commandPost(Cmd::Play, name.c_str());
    sendOk(req);
  });
  server.on(exact("/api/stop"), HTTP_POST, [](AsyncWebServerRequest* req) { commandPost(Cmd::Stop); sendOk(req); });
  server.on(exact("/api/next"), HTTP_POST, [](AsyncWebServerRequest* req) { commandPost(Cmd::Next); sendOk(req); });

  server.on(exact("/api/live"), HTTP_POST,
            [](AsyncWebServerRequest* req) {
              if (!req->_tempObject) return sendError(req, 413, "frame too large or out of memory");
              sendOk(req);
            },
            nullptr, handleLiveBody);
  server.on(exact("/api/live/end"), HTTP_POST, [](AsyncWebServerRequest* req) { commandPost(Cmd::LiveEnd); sendOk(req); });

  server.on(exact("/api/playlist"), HTTP_GET, [](AsyncWebServerRequest* req) {
    Playlist pl;
    playlistLoad(pl);
    JsonDocument doc;
    playlistToJson(pl, doc.to<JsonObject>());
    sendJson(req, doc);
  });
  auto* playlistPut = new AsyncCallbackJsonWebHandler(exact("/api/playlist"), [](AsyncWebServerRequest* req, JsonVariant& json) {
    Playlist pl;
    if (!playlistFromJson(json, pl)) return sendError(req, 400, "invalid playlist");
    if (!playlistSave(pl)) return sendError(req, 500, "cannot save playlist");
    commandPost(Cmd::ReloadPlaylist);
    sendOk(req);
  });
  playlistPut->setMethod(HTTP_PUT | HTTP_POST);
  server.addHandler(playlistPut);

  server.on(exact("/api/display"), HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    displayToJson(doc.to<JsonObject>());
    sendJson(req, doc);
  });
  auto* displayPut = new AsyncCallbackJsonWebHandler(exact("/api/display"), handleDisplayPut);
  displayPut->setMethod(HTTP_PUT | HTTP_POST);
  server.addHandler(displayPut);
  server.on(exact("/api/display/presets"), HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
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
    sendJson(req, doc);
  });
  server.on(exact("/api/display/test"), HTTP_POST, [](AsyncWebServerRequest* req) {
    commandPost(Cmd::TestPattern);
    sendOk(req);
  });
  server.on(exact("/api/brightness"), HTTP_POST, [](AsyncWebServerRequest* req) {
    commandPost(Cmd::Brightness, "", constrain(param(req, "value").toInt(), 0, 255));
    sendOk(req);
  });

  server.on(exact("/api/wifi"), HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    doc["mode"] = wifi::isAP() ? "ap" : "sta";
    doc["ssid"] = wifi::ssid();
    doc["ip"] = wifi::ip();
    doc["rssi"] = wifi::rssi();
    doc["saved_ssid"] = wifi::savedSsid();
    sendJson(req, doc);
  });
  auto* wifiPut = new AsyncCallbackJsonWebHandler(exact("/api/wifi"), [](AsyncWebServerRequest* req, JsonVariant& json) {
    const String ssid = json["ssid"] | "";
    if (ssid.isEmpty() || ssid.length() > 32) return sendError(req, 400, "invalid ssid");
    wifi::saveCredentials(ssid, json["password"] | "");
    sendOk(req);
    commandPost(Cmd::Reboot);
  });
  wifiPut->setMethod(HTTP_PUT | HTTP_POST);
  server.addHandler(wifiPut);
  server.on(exact("/api/wifi"), HTTP_DELETE, [](AsyncWebServerRequest* req) {
    wifi::forgetCredentials();
    sendOk(req);
    commandPost(Cmd::Reboot);
  });
  server.on(exact("/api/wifi/scan"), HTTP_GET, [](AsyncWebServerRequest* req) {
    JsonDocument doc;
    wifi::scanJson(doc.to<JsonObject>());
    sendJson(req, doc);
  });

  server.on(exact("/api/reboot"), HTTP_POST, [](AsyncWebServerRequest* req) {
    sendOk(req);
    commandPost(Cmd::Reboot);
  });

  server.onNotFound([](AsyncWebServerRequest* req) {
    if (req->method() == HTTP_OPTIONS) return req->send(204);  // CORS preflight
    // Captive portal: phones probe random URLs after joining the AP; send them to the editor.
    if (wifi::isAP() && !req->url().startsWith("/api/")) {
      return req->redirect("http://" + wifi::ip() + "/");
    }
    sendError(req, 404, "not found");
  });

  server.begin();
}
