#pragma once
#include <FS.h>

#include "decoder.h"

// Animation file on LittleFS.
class FileSource : public Source {
public:
  explicit FileSource(File f) : f_(f), size_(f.size()) {}
  ~FileSource() override { f_.close(); }
  bool readAt(uint32_t offset, uint8_t* dst, size_t len) override {
    return f_.seek(offset) && f_.read(dst, len) == len;
  }
  uint32_t size() const override { return size_; }

private:
  File f_;
  uint32_t size_;
};
