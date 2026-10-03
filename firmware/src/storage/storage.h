#pragma once
#include <Arduino.h>
#include <LittleFS.h>

#include <vector>

// Animation files live in /anims/<name>.dpa on the LittleFS partition.
namespace storage {

struct AnimInfo {
  String name;
  size_t size;
  uint16_t width, height;  // target screen
  uint16_t frames;
  uint8_t colorMode;
};

constexpr const char* kAnimDir = "/anims";
constexpr size_t kMaxNameBytes = 48;

bool begin();
size_t totalBytes();
size_t usedBytes();
size_t freeBytes();

// Keeps UTF-8 (Thai names work), drops path separators/control chars, trims to kMaxNameBytes
// on a character boundary. Returns "" if nothing usable is left.
String sanitizeName(const String& raw);
String animPath(const String& name);
bool exists(const String& name);
size_t fileSize(const String& name);
bool remove(const String& name);
String newUploadTmpPath();  // unique temp file for one upload; leftovers are removed at boot
bool commitUpload(const String& tmpPath, const String& name);  // rename over /anims/<name>.dpa
std::vector<AnimInfo> list();

}  // namespace storage
