#pragma once
#include <stddef.h>

// A replacement keeps the previous file until the new name is installed. The same
// recovery runs at boot, so interruption after either rename retains a usable file.
namespace storage {
template <typename Fs, typename Path>
bool recoverReplacement(Fs& fs, const Path& dest, const Path& backup) {
  if (!fs.exists(backup)) return true;
  return fs.exists(dest) ? fs.remove(backup) : fs.rename(backup, dest);
}

template <typename Fs, typename Path>
bool replaceFile(Fs& fs, const Path& tmp, const Path& dest, const Path& backup) {
  if (!fs.exists(tmp) || !recoverReplacement(fs, dest, backup)) return false;
  const bool hadOld = fs.exists(dest);
  if (hadOld && !fs.rename(dest, backup)) return false;
  if (!fs.rename(tmp, dest)) {
    if (hadOld) fs.rename(backup, dest); // if rollback fails, boot recovery retries it
    return false;
  }
  if (hadOld) fs.remove(backup); // failed cleanup is harmless and retried at boot
  return true;
}
template <typename Fs, typename Path, typename Write, typename Validate>
bool writeReplacement(Fs& fs, const Path& tmp, const Path& dest, const Path& backup,
                      size_t expected, Write write, Validate validate) {
  auto f = fs.open(tmp, "w");
  if (!f) return false;
  const size_t written = write(f);
  f.flush();
  const bool complete = written == expected && f.size() == expected;
  f.close();
  const bool saved = complete && validate(tmp) && replaceFile(fs, tmp, dest, backup);
  if (!saved) fs.remove(tmp);
  return saved;
}

template <typename Fs, typename File, typename Path>
void discardInterruptedUpload(Fs& fs, File& file, const Path& path, bool queued) {
  if (queued) return;
  file.close();
  fs.remove(path);
}
} // namespace storage
