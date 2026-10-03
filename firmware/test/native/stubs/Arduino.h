#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <mutex>
#include <string>
using String = std::string;
inline uint32_t nativeNow = 0;
inline uint32_t millis() { return nativeNow; }
inline void delay(uint32_t ms) { nativeNow += ms; }
inline long random(long n) { return n ? n - 1 : 0; }
struct NativeSerial { template <typename... Args> void printf(const char*, Args...) {} };
inline NativeSerial Serial;
struct NativeEsp { void restart() {} };
inline NativeEsp ESP;
using portMUX_TYPE = std::mutex;
#define portMUX_INITIALIZER_UNLOCKED {}
#define portENTER_CRITICAL(mux) (mux)->lock()
#define portEXIT_CRITICAL(mux) (mux)->unlock()
inline size_t strlcpy(char* dst, const char* src, size_t size) {
  const size_t len = strlen(src);
  if (size) { const size_t n = len < size - 1 ? len : size - 1; memcpy(dst, src, n); dst[n] = 0; }
  return len;
}
