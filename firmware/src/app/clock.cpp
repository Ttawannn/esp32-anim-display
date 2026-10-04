#include "clock.h"

#include <Preferences.h>
#include <sys/time.h>
#include <time.h>

static constexpr time_t kEarliest = 1704067200;  // 2024-01-01: anything earlier means "not set"
static int tzMinutes = 420;                      // Thailand (UTC+7) until told otherwise
static char tz[16];

// POSIX TZ strings count west of UTC: +07:00 is "UTC-7".
static void applyTz() {
  const int m = tzMinutes < 0 ? -tzMinutes : tzMinutes;
  if (m % 60) snprintf(tz, sizeof(tz), "UTC%c%d:%02d", tzMinutes > 0 ? '-' : '+', m / 60, m % 60);
  else snprintf(tz, sizeof(tz), "UTC%c%d", tzMinutes > 0 ? '-' : '+', m / 60);
  setenv("TZ", tz, 1);
  tzset();
}

void clockBegin() {
  Preferences p;
  if (p.begin("clock", true)) {
    tzMinutes = constrain(p.getShort("tz", 420), -720, 840);
    p.end();
  }
  applyTz();
}

void clockStartNtp() {
  configTzTime(tz, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
}

bool clockSet(uint32_t epoch, int minutes) {
  if (epoch < kEarliest || minutes < -720 || minutes > 840) return false;
  const timeval tv{(time_t)epoch, 0};
  settimeofday(&tv, nullptr);
  if (minutes != tzMinutes) {
    tzMinutes = minutes;
    applyTz();
    Preferences p;
    if (p.begin("clock", false)) {
      p.putShort("tz", minutes);
      p.end();
    }
  }
  return true;
}

uint32_t clockEpoch() {
  const time_t now = time(nullptr);
  return now < kEarliest ? 0 : (uint32_t)now;
}

int clockTzMinutes() { return tzMinutes; }

dpa::ClockTime clockNow() {
  dpa::ClockTime t{};
  const time_t now = time(nullptr);
  if (now < kEarliest) return t;
  struct tm tm;
  localtime_r(&now, &tm);
  t.valid = true;
  t.year = tm.tm_year + 1900;
  t.month = tm.tm_mon + 1;
  t.day = tm.tm_mday;
  t.hour = tm.tm_hour;
  t.minute = tm.tm_min;
  t.second = tm.tm_sec;
  t.wday = tm.tm_wday;
  return t;
}
