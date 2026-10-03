#pragma once
namespace storage {
inline bool nativeCommitSucceeds = true;
inline bool commitUpload(const char*, const char*) { return nativeCommitSucceeds; }
}
struct NativeLittleFS { bool remove(const char*) { return true; } };
inline NativeLittleFS LittleFS;
