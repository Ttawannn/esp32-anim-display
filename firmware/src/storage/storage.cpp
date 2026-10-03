#include "storage.h"

#include <algorithm>
#include <atomic>
#include "replace.h"

#include "player/dpa.h"
#include "player/playlist.h"

namespace storage {

bool begin() {
  if (!LittleFS.begin(true)) return false;  // formats on first boot
  if (!LittleFS.exists(kAnimDir)) LittleFS.mkdir(kAnimDir);
  // Remove temp files left by interrupted uploads.
  std::vector<String> stale;
  std::vector<String> backups;
  File dir = LittleFS.open(kAnimDir);
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    if (String(f.name()).startsWith(".up-")) stale.push_back(String(kAnimDir) + "/" + f.name());
    if (String(f.name()).endsWith(".dpa.bak")) backups.push_back(String(kAnimDir) + "/" + f.name());
  }
  dir.close();
  for (const auto& backup : backups) {
    const String dest = backup.substring(0, backup.length() - 4);
    if (!recoverReplacement(LittleFS, dest, backup)) return false;
  }
  for (const auto& p : stale) LittleFS.remove(p);
  return playlistRecover();
}

size_t totalBytes() { return LittleFS.totalBytes(); }
size_t usedBytes() { return LittleFS.usedBytes(); }
size_t freeBytes() { return totalBytes() - usedBytes(); }

String sanitizeName(const String& raw) {
  String s = raw;
  if (s.endsWith(".dpa")) s.remove(s.length() - 4);
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    const uint8_t c = s[i];
    if (c < 0x20 || c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' ||
        c == '>' || c == '|') {
      out += '_';
    } else {
      out += (char)c;
    }
  }
  out.trim();
  while (out.startsWith(".")) out.remove(0, 1);  // no hidden files / ".."
  if (out.length() > kMaxNameBytes) {
    size_t cut = kMaxNameBytes;
    while (cut > 0 && ((uint8_t)out[cut] & 0xC0) == 0x80) cut--;  // don't split a UTF-8 character
    out.remove(cut);
  }
  return out;
}

String animPath(const String& name) { return String(kAnimDir) + "/" + name + ".dpa"; }

bool exists(const String& name) { return LittleFS.exists(animPath(name)); }

size_t fileSize(const String& name) {
  File f = LittleFS.open(animPath(name), "r");
  return f ? f.size() : 0;
}

bool remove(const String& name) { return LittleFS.remove(animPath(name)); }

String newUploadTmpPath() {
  static std::atomic<uint32_t> counter{0};
  return String(kAnimDir) + "/.up-" + String(millis()) + "-" + String(++counter) + ".tmp";
}

bool commitUpload(const String& tmpPath, const String& name) {
  const String dest = animPath(name);
  const String backup = dest + ".bak";
  return replaceFile(LittleFS, tmpPath, dest, backup);
}

std::vector<AnimInfo> list() {
  std::vector<AnimInfo> out;
  File dir = LittleFS.open(kAnimDir);
  if (!dir) return out;
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    String fname = f.name();
    if (f.isDirectory() || !fname.endsWith(".dpa")) continue;
    AnimInfo info{fname.substring(0, fname.length() - 4), f.size(), 0, 0, 0, 0};
    uint8_t buf[dpa::kHeaderSize];
    dpa::Header h;
    if (f.read(buf, sizeof(buf)) == sizeof(buf) && dpa::parseHeader(buf, sizeof(buf), h)) {
      info.width = h.screenW;
      info.height = h.screenH;
      info.frames = h.frameCount;
      info.colorMode = h.colorMode;
    }
    out.push_back(info);
  }
  std::sort(out.begin(), out.end(), [](const AnimInfo& a, const AnimInfo& b) { return a.name < b.name; });
  return out;
}

}  // namespace storage
