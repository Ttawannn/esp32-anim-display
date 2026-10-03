#include <assert.h>
#include <stdio.h>
#include <fstream>
#include <iterator>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "app/commands.h"
#include "player/validation.h"
#include "storage/replace.h"
#include "storage/storage.h"

static std::vector<uint8_t> file(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
}
static bool valid(std::vector<uint8_t>& bytes, bool live = false) {
  MemSource src(bytes.data(), bytes.size(), false);
  return dpa::validate(src, live);
}
static void wr32(std::vector<uint8_t>& bytes, size_t off, uint32_t value) {
  for (int i = 0; i < 4; i++) bytes[off + i] = value >> (i * 8);
}
static void wr16(std::vector<uint8_t>& bytes, size_t off, uint16_t value) {
  bytes[off] = value; bytes[off + 1] = value >> 8;
}

struct Fs {
  std::map<std::string, std::string> files;
  std::set<std::string> failRename;
  bool exists(const std::string& p) { return files.count(p); }
  bool remove(const std::string& p) { return files.erase(p); }
  bool rename(const std::string& from, const std::string& to) {
    if (failRename.count(from) || !exists(from) || exists(to)) return false;
    files[to] = files[from]; files.erase(from); return true;
  }
};

int main(int argc, char** argv) {
  const std::string dir = argc > 1 ? argv[1] : "shared/test-vectors";
  if (argc > 2) { auto browserFile = file(argv[2]); assert(!browserFile.empty() && valid(browserFile)); }
  for (const char* name : {"indexed_delta", "indexed_many", "mono_pad", "mono_full"}) {
    auto bytes = file(dir + "/" + name + ".dpa");
    assert(!bytes.empty() && valid(bytes));
    for (size_t n = 0; n < bytes.size(); n++) {
      std::vector<uint8_t> truncated(bytes.begin(), bytes.begin() + n);
      assert(!valid(truncated));
    }
  }
  auto original = file(dir + "/indexed_delta.dpa");
  const size_t table = dpa::rd32(original.data() + 28);
  const size_t frame = dpa::rd32(original.data() + table);
  auto b = original; wr32(b, table, 0xfffffff0); assert(!valid(b));
  b = original; wr32(b, table + 4, 0xffffffff); assert(!valid(b));
  b = original; b[table + 10] = 9; assert(!valid(b));
  b = original; b[table + 11] = 0; assert(!valid(b));
  b = original; b[frame + 4] = 255; assert(!valid(b));
  b = original; b[frame + 8] = 128; b[frame + 9] = 255; assert(!valid(b));
  b = original; b.push_back(0); assert(!valid(b));
  assert(!valid(original, true));
  auto mono = file(dir + "/mono_pad.dpa");
  const size_t mt = dpa::rd32(mono.data() + 28), mf = dpa::rd32(mono.data() + mt);
  mono[mf + 6] = 24; assert(!valid(mono));
  const auto jpeg = file("firmware/tools/test_240.jpg");
  assert(!jpeg.empty());
  b.assign(52 + jpeg.size(), 0);
  memcpy(b.data(), "DPA1", 4); b[4] = 1; b[14] = 1;
  for (size_t off : {6, 8, 10, 12}) wr16(b, off, 240);
  wr16(b, 20, 1); wr32(b, 28, 32); wr32(b, 32, 44); wr32(b, 36, jpeg.size() + 8);
  wr16(b, 40, 100); b[42] = dpa::kFrameJpeg; b[43] = 1;
  wr16(b, 48, 240); wr16(b, 50, 240); memcpy(b.data() + 52, jpeg.data(), jpeg.size());
  assert(valid(b, true));
  b.back() = 0; assert(!valid(b));
  printf("ok   DPA validation: vectors, all truncations, offsets, types, palette indices, mono bounds\n");

  const std::string tmp = "tmp", dest = "dest", backup = "backup";
  Fs fs{{{tmp, "new"}, {dest, "old"}}, {}};
  assert(storage::replaceFile(fs, tmp, dest, backup)); assert(fs.files[dest] == "new" && !fs.exists(backup));
  fs = Fs{{{tmp, "new"}, {dest, "old"}}, {tmp}};
  assert(!storage::replaceFile(fs, tmp, dest, backup)); assert(fs.files[dest] == "old");
  fs = Fs{{{tmp, "new"}, {dest, "old"}}, {dest}};
  assert(!storage::replaceFile(fs, tmp, dest, backup)); assert(fs.files[dest] == "old");
  fs = Fs{{{tmp, "new"}, {dest, "old"}}, {tmp, backup}};
  assert(!storage::replaceFile(fs, tmp, dest, backup)); assert(fs.files[backup] == "old");
  fs.failRename.clear(); assert(storage::recoverReplacement(fs, dest, backup)); assert(fs.files[dest] == "old");
  fs = Fs{{{backup, "old"}, {dest, "new"}}, {}};
  assert(storage::recoverReplacement(fs, dest, backup)); assert(fs.files[dest] == "new" && !fs.exists(backup));
  printf("ok   storage: replacement, rename failures, rollback, interrupted-save recovery\n");

  commandsBegin();
  for (int i = 0; i < 12; i++) assert(commandPost(Cmd::Next, "", i));
  assert(!commandPost(Cmd::Next));
  Command c;
  for (int i = 0; i < 12; i++) { assert(commandTake(c)); assert(c.value == i); }
  assert(!commandTake(c));
  const uint32_t id = uploadBegin();
  UploadResult result;
  assert(id && uploadRead(id, result) && result.state == UploadState::Pending);
  assert(commandPost(Cmd::CommitUpload, "a", 0, (uint8_t*)strdup("tmp"), 4, id));
  assert(commandTake(c) && commandCommitUpload(c)); free(c.data);
  assert(uploadRead(id, result) && result.state == UploadState::Saved);
  const uint32_t failed = uploadBegin();
  storage::nativeCommitSucceeds = false;
  assert(commandPost(Cmd::CommitUpload, "a", 0, (uint8_t*)strdup("tmp"), 4, failed));
  assert(commandTake(c) && !commandCommitUpload(c)); free(c.data);
  assert(uploadRead(failed, result) && result.state == UploadState::Failed);
  std::vector<uint32_t> pending;
  for (int i = 0; i < 16; i++) { const auto n = uploadBegin(); assert(n); pending.push_back(n); }
  assert(uploadBegin() == 0);
  uploadComplete(pending[0], false); assert(uploadBegin() != 0);
  printf("ok   commands: queue full, FIFO, pending/saved/failed receipts, receipt capacity\nall passed\n");
}
