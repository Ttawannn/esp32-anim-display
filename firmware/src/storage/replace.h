#pragma once

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
} // namespace storage
