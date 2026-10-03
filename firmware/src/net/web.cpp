#include "web.h"

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>

#include <memory>

#include "api.h"
#include "player/dpa.h"
#include "storage/storage.h"
#include "storage/replace.h"
#include "web_assets.h"
#include "wifi_manager.h"

static AsyncWebServer server(80);
static constexpr size_t kMaxJsonBody = 16 * 1024;

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

static String param(AsyncWebServerRequest* req, const char* name) {
  return req->hasParam(name) ? req->getParam(name)->value() : String();
}

static bool isBinaryRoute(AsyncWebServerRequest* req) {
  const String& url = req->url();
  const auto m = req->method();
  return (url == "/api/anims" && m == HTTP_POST) || (url == "/api/anims/file" && m == HTTP_GET) ||
         (url == "/api/live" && m == HTTP_POST);
}

// All JSON endpoints go through apiHandle(), shared with the USB serial transport.
class ApiHandler : public AsyncWebHandler {
public:
  bool canHandle(AsyncWebServerRequest* req) const override {
    return req->url().startsWith("/api/") && req->method() != HTTP_OPTIONS && !isBinaryRoute(req);
  }
  bool isRequestHandlerTrivial() const override { return false; }  // we need the body

  void handleBody(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) override {
    if (total > kMaxJsonBody) return;
    if (index == 0) req->_tempObject = calloc(1, total + 1);  // NUL-terminated, freed by the server
    if (req->_tempObject) memcpy(static_cast<char*>(req->_tempObject) + index, data, len);
  }

  void handleRequest(AsyncWebServerRequest* req) override {
    if (req->contentLength() > kMaxJsonBody) return sendError(req, 413, "JSON body too large");
    if (req->contentLength() && !req->_tempObject) return sendError(req, 503, "out of memory");
    JsonDocument body;
    if (req->_tempObject && deserializeJson(body, static_cast<const char*>(req->_tempObject))) {
      return sendError(req, 400, "invalid JSON");
    }
    JsonDocument out;
    const int status = apiHandle(req->methodToString(), req->url(), [req](const char* n) { return param(req, n); },
                                 body.as<JsonVariantConst>(), out);
    sendJson(req, out, status);
  }
};

// ---------------------------------------------------------------------------------------------
// Binary endpoints

// Per-request upload state, freed by the server with the request (plain C struct: free()d).
struct UploadState {
  int code;  // 0 = ok
  const char* error;
  char name[64];
  char tmp[48];
  bool play;
  bool complete;
  bool queued;
  uint32_t uploadId;
  size_t written;
};

static void handleUploadChunk(AsyncWebServerRequest* req, const String& filename, size_t index, uint8_t* data,
                              size_t len, bool final) {
  auto* st = static_cast<UploadState*>(req->_tempObject);
  if (index == 0) {
    st = static_cast<UploadState*>(calloc(1, sizeof(UploadState)));
    req->_tempObject = st;
    if (!st) return;
    req->onDisconnect([req, st]() {
      // A queued commit owns the path now; interruption before that leaves only temporary data.
      if (!st->queued && st->tmp[0]) {
        storage::discardInterruptedUpload(LittleFS, req->_tempFile, st->tmp, st->queued);
      }
    });
    st->play = param(req, "play") != "0";
    String name, tmp;
    st->code = apiBeginUpload(param(req, "name").length() ? param(req, "name") : filename, req->contentLength(), name,
                              tmp, st->error);
    if (st->code) return;
    strlcpy(st->name, name.c_str(), sizeof(st->name));
    strlcpy(st->tmp, tmp.c_str(), sizeof(st->tmp));
    req->_tempFile = LittleFS.open(st->tmp, "w");
    if (!req->_tempFile) {
      st->code = 500;
      st->error = "cannot create file";
      return;
    }
  }
  if (!st || st->code) return;
  if (len && req->_tempFile.write(data, len) != len) {
    st->code = 507;
    st->error = "write failed (storage full?)";
    req->_tempFile.close();
    LittleFS.remove(st->tmp);
    return;
  }
  st->written += len;
  if (final) {
    req->_tempFile.close();
    st->complete = true;
    st->code = apiFinishUpload(st->tmp, st->name, st->play, st->uploadId, st->error);
    st->queued = st->code == 0;
  }
}

static void handleUploadDone(AsyncWebServerRequest* req) {
  auto* st = static_cast<UploadState*>(req->_tempObject);
  if (!st) return sendError(req, 400, "no file received");
  if (st->code) return sendError(req, st->code, st->error);
  if (!st->complete) {
    req->_tempFile.close();
    LittleFS.remove(st->tmp);
    return sendError(req, 400, "incomplete transfer");
  }
  JsonDocument doc;
  doc["ok"] = true;
  doc["name"] = st->name;
  doc["size"] = st->written;
  doc["upload_id"] = st->uploadId;
  sendJson(req, doc, 202);
}

// POST /api/live: raw single-frame DPA in the body.
static void handleLiveBody(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
  if (index == 0) {
    if (total > kMaxLiveBytes || total < dpa::kHeaderSize || ESP.getMaxAllocHeap() < total + 16 * 1024) return;
    req->_tempObject = malloc(total);
  }
  if (!req->_tempObject) return;
  memcpy(static_cast<uint8_t*>(req->_tempObject) + index, data, len);
}

// GET /api/anims/file: the raw file, optionally only the first `max` bytes (thumbnails).
static void handleFile(AsyncWebServerRequest* req) {
  const String name = storage::sanitizeName(param(req, "name"));
  auto f = std::make_shared<File>(LittleFS.open(storage::animPath(name), "r"));
  if (name.isEmpty() || !*f) return sendError(req, 404, "not found");
  size_t len = f->size();
  const long max = param(req, "max").toInt();
  if (max > 0 && (size_t)max < len) len = max;
  req->send(req->beginResponse("application/octet-stream", len, [f, len](uint8_t* buf, size_t maxLen, size_t index) -> size_t {
    if (index >= len) return 0;
    return f->read(buf, std::min(maxLen, len - index));
  }));
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

  server.on(exact("/api/anims"), HTTP_POST, handleUploadDone, handleUploadChunk);
  server.on(exact("/api/anims/file"), HTTP_GET, handleFile);
  server.on(exact("/api/live"), HTTP_POST,
            [](AsyncWebServerRequest* req) {
              if (!req->_tempObject) return sendError(req, 413, "frame too large or out of memory");
              auto* data = static_cast<uint8_t*>(req->_tempObject);
              req->_tempObject = nullptr; // apiLiveFrame always takes ownership
              const char* error = nullptr;
              const int code = apiLiveFrame(data, req->contentLength(), error);
              if (code) return sendError(req, code, error);
              req->send(200, "application/json", "{\"ok\":true}");
            },
            nullptr, handleLiveBody);
  server.addHandler(new ApiHandler());

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
