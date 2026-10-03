#pragma once
#include <Arduino.h>
#include <vector>
namespace storage {
inline bool nativeCommitSucceeds = true;
inline bool commitUpload(const char*, const char*) { return nativeCommitSucceeds; }
struct AnimInfo { String name; };
inline std::vector<AnimInfo> list() { return {{"idle"}}; }
inline bool exists(const String&) { return true; }
inline bool remove(const String&) { return true; }
}
struct NativeLittleFS { bool remove(const char*) { return true; } };
inline NativeLittleFS LittleFS;
