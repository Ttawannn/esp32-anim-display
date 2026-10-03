#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

#include <functional>

// Transport-independent REST API, shared by HTTP (net/web.cpp) and USB serial (app/serial_rpc.cpp)
// so the web editor can talk to the board over Wi-Fi or a USB cable. See docs/api.md.

using ApiParams = std::function<String(const char* name)>;  // query parameter, "" if missing

// Every JSON endpoint. Returns the HTTP status and fills `out` (errors: {"error": "..."}).
// The binary endpoints (upload, file download, live frame) are driven by each transport
// with the helpers below.
int apiHandle(const String& method, const String& path, const ApiParams& params, JsonVariantConst body,
              JsonDocument& out);

// Uploads: check space, then write a temp file, then apiFinishUpload() validates it and asks the
// loop task to rename it into place. Each returns 0 on success or an HTTP status + error text.
int apiBeginUpload(const String& rawName, size_t size, String& name, String& tmpPath, const char*& error);
int apiFinishUpload(const String& tmpPath, const String& name, bool play, uint32_t& uploadId, const char*& error);

// Live preview: takes ownership of a malloc'd single-frame .dpa.
int apiLiveFrame(uint8_t* data, size_t len, const char*& error);
constexpr size_t kMaxLiveBytes = 96 * 1024;
