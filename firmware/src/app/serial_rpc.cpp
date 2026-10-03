#include "serial_rpc.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <mbedtls/base64.h>

#include "app.h"
#include "net/api.h"
#include "storage/storage.h"

static constexpr int kProtocolVersion = 1;
static constexpr size_t kMaxReadChunk = 3072;

// One transfer at a time: an animation file (stored like an HTTP upload) or a live frame (RAM).
struct Transfer {
  enum Kind { None, File_, Live } kind = None;
  File file;
  String tmp, name;
  bool play = false;
  uint8_t* buf = nullptr;
  size_t size = 0, received = 0;
  uint32_t lastAt = 0;
};
static Transfer xfer;

// Chunk buffers are static: they would take ~7 KB of the 8 KB loop-task stack.
static uint8_t chunk[kMaxReadChunk + 16];
static char b64[(kMaxReadChunk + 16) * 4 / 3 + 8];

static void abortTransfer() {
  if (xfer.kind == Transfer::File_) {
    xfer.file.close();
    LittleFS.remove(xfer.tmp);
  }
  free(xfer.buf);
  xfer = Transfer();
}

void serialRpcPoll() {
  if (xfer.kind != Transfer::None && millis() - xfer.lastAt > 30000) abortTransfer();
}

static void reply(JsonDocument& doc) {
  Serial.write('@');
  serializeJson(doc, Serial);
  Serial.write('\n');
}

static void replyStatus(int id, int status, const char* error = nullptr) {
  JsonDocument doc;
  doc["id"] = id;
  doc["status"] = status;
  if (error) doc["body"]["error"] = error;
  reply(doc);
}

static void putBegin(int id, JsonVariantConst req) {
  abortTransfer();
  const size_t size = req["size"] | 0;
  const char* kind = req["kind"] | "file";
  if (strcmp(kind, "live") && strcmp(kind, "file")) return replyStatus(id, 400, "invalid transfer kind");
  if (!strcmp(kind, "live")) {
    if (size < 32 || size > kMaxLiveBytes || ESP.getMaxAllocHeap() < size + 16 * 1024) {
      return replyStatus(id, 413, "frame too large or out of memory");
    }
    xfer.buf = (uint8_t*)malloc(size);
    if (!xfer.buf) return replyStatus(id, 413, "frame too large or out of memory");
    xfer.kind = Transfer::Live;
  } else {
    const char* error = nullptr;
    const int code = apiBeginUpload(req["name"] | "", size, xfer.name, xfer.tmp, error);
    if (code) return replyStatus(id, code, error);
    xfer.file = LittleFS.open(xfer.tmp, "w");
    if (!xfer.file) return replyStatus(id, 500, "cannot create file");
    xfer.kind = Transfer::File_;
    xfer.play = req["play"] | true;
  }
  xfer.size = size;
  xfer.lastAt = millis();
  replyStatus(id, 200);
}

static void putData(int id, JsonVariantConst req) {
  if (xfer.kind == Transfer::None) return replyStatus(id, 400, "no transfer in progress");
  const char* data = req["data"] | "";
  size_t n = 0;
  if (mbedtls_base64_decode(chunk, sizeof(chunk), &n, (const unsigned char*)data, strlen(data)) != 0 ||
      xfer.received + n > xfer.size) {
    abortTransfer();
    return replyStatus(id, 400, "bad chunk");
  }
  if (xfer.kind == Transfer::Live) {
    memcpy(xfer.buf + xfer.received, chunk, n);
  } else if (xfer.file.write(chunk, n) != n) {
    abortTransfer();
    return replyStatus(id, 507, "write failed (storage full?)");
  }
  xfer.received += n;
  xfer.lastAt = millis();
  replyStatus(id, 200);
}

static void putEnd(int id) {
  if (xfer.kind == Transfer::None) return replyStatus(id, 400, "no transfer in progress");
  if (xfer.received != xfer.size) {
    abortTransfer();
    return replyStatus(id, 400, "incomplete transfer");
  }
  const char* error = nullptr;
  int code;
  JsonDocument doc;
  doc["id"] = id;
  if (xfer.kind == Transfer::Live) {
    code = apiLiveFrame(xfer.buf, xfer.size, error);  // takes the buffer
    xfer.buf = nullptr;
  } else {
    xfer.file.close();
    uint32_t uploadId = 0;
    code = apiFinishUpload(xfer.tmp, xfer.name, xfer.play, uploadId, error);
    doc["body"]["upload_id"] = uploadId;
    doc["body"]["name"] = xfer.name;
    doc["body"]["size"] = xfer.size;
  }
  xfer = Transfer();
  doc["status"] = code ? code : 200;
  if (code) doc["body"]["error"] = error;
  else doc["body"]["ok"] = true;
  reply(doc);
}

// Reads part of an animation file (thumbnails / backups over USB).
static void read(int id, JsonVariantConst req) {
  const String name = storage::sanitizeName(req["name"] | "");
  File f = LittleFS.open(storage::animPath(name), "r");
  if (name.isEmpty() || !f) return replyStatus(id, 404, "not found");
  const size_t offset = req["offset"] | 0;
  const size_t want = min<size_t>(req["length"] | kMaxReadChunk, kMaxReadChunk);
  size_t n = 0;
  if (offset < f.size() && f.seek(offset)) n = f.read(chunk, min<size_t>(want, f.size() - offset));
  size_t b64len = 0;
  mbedtls_base64_encode((unsigned char*)b64, sizeof(b64), &b64len, chunk, n);
  b64[b64len] = 0;
  JsonDocument doc;
  doc["id"] = id;
  doc["status"] = 200;
  doc["size"] = f.size();
  doc["data"] = (const char*)b64;
  reply(doc);
}

void serialRpcHandle(const char* json) {
  JsonDocument req;
  if (deserializeJson(req, json)) {
    JsonDocument doc;
    doc["id"] = -1;
    doc["status"] = 400;
    doc["body"]["error"] = "invalid JSON";
    return reply(doc);
  }
  const int id = req["id"] | 0;
  const char* op = req["op"] | "";

  if (!strcmp(op, "hello")) {
    JsonDocument doc;
    doc["id"] = id;
    doc["status"] = 200;
    doc["body"]["proto"] = kProtocolVersion;
    doc["body"]["version"] = FIRMWARE_VERSION;
    return reply(doc);
  }
  if (!strcmp(op, "api")) {
    JsonVariantConst query = req["query"];
    JsonDocument out;
    const int status = apiHandle(req["method"] | "GET", req["path"] | "",
                                 [query](const char* n) { return String(query[n] | ""); }, req["body"], out);
    JsonDocument doc;
    doc["id"] = id;
    doc["status"] = status;
    doc["body"] = out;
    return reply(doc);
  }
  if (!strcmp(op, "put_begin")) return putBegin(id, req.as<JsonVariantConst>());
  if (!strcmp(op, "put_data")) return putData(id, req.as<JsonVariantConst>());
  if (!strcmp(op, "put_end")) return putEnd(id);
  if (!strcmp(op, "put_abort")) { abortTransfer(); return replyStatus(id, 200); }
  if (!strcmp(op, "read")) return read(id, req.as<JsonVariantConst>());
  replyStatus(id, 404, "unknown op");
}
