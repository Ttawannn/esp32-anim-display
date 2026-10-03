#pragma once
#include <Arduino.h>
class Preferences {
  inline static String last;
public:
  bool begin(const char*, bool) { return true; }
  String getString(const char*, const char*) { return last; }
  void putString(const char*, const String& value) { last = value; }
  void end() {}
};
