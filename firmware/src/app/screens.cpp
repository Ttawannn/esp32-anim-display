#include "screens.h"

#include "app.h"
#include "display/gfx.h"
#include "net/wifi_manager.h"
#include "storage/storage.h"

void screenBoot(Panel& p, const char* status) {
  p.fillScreen(color::Black);
  const int16_t y = p.height() / 2 - 10;
  gfxDrawTextCentered(p, y, "Display Editor", color::White, color::Black);
  if (status) gfxDrawTextCentered(p, y + 12, status, color::Gray, color::Black);
  p.flush();
}

void screenInfo(Panel& p) {
  char l[7][40];
  size_t n = 0;
  // Most important first: tiny OLEDs only fit three or four lines.
  if (p.height() >= 48) snprintf(l[n++], 40, "Display Editor");
  snprintf(l[n++], 40, "http://%s", wifi::ip().c_str());
  snprintf(l[n++], 40, "%s%s", wifi::isAP() ? "WiFi " : "", wifi::ssid().c_str());
  if (wifi::isAP()) snprintf(l[n++], 40, "pw %s", wifi::apPassword());
  snprintf(l[n++], 40, "%s.local", wifi::hostname());
  snprintf(l[n++], 40, "%u files, %uK free", (unsigned)storage::list().size(), (unsigned)(storage::freeBytes() / 1024));
  const char* lines[7];
  for (size_t i = 0; i < n; i++) lines[i] = l[i];
  gfxTextScreen(p, lines, n);
}

void screenMessage(Panel& p, const char* title, const char* line) {
  const char* lines[2] = {title, line};
  gfxTextScreen(p, lines, line ? 2 : 1);
}
