#include "wifi_manager.h"

#include <DNSServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WiFi.h>

namespace wifi {

static constexpr const char* kApPassword = "displayedit";
static constexpr uint32_t kConnectTimeoutMs = 15000;

static DNSServer dns;
static bool apMode = false;
static String apName;
static String devName;    // user-visible name, any UTF-8 (Thai is fine)
static char host[25];     // mDNS hostname derived from the name: <host>.local

struct StoredCredentials { uint8_t version; char ssid[33]; char password[65]; };
static StoredCredentials credentials() {
  StoredCredentials stored{};
  Preferences p;
  if (p.begin("wifi", true)) {
    if (p.getBytesLength("credentials") != sizeof(stored) ||
        p.getBytes("credentials", &stored, sizeof(stored)) != sizeof(stored) || stored.version != 1 ||
        !memchr(stored.ssid, 0, sizeof(stored.ssid)) || !memchr(stored.password, 0, sizeof(stored.password))) {
      stored = {};
      strlcpy(stored.ssid, p.getString("ssid", "").c_str(), sizeof(stored.ssid));
      strlcpy(stored.password, p.getString("pass", "").c_str(), sizeof(stored.password));
    }
    p.end();
  }
  return stored;
}

static void applyTxPower() {
#if defined(BOARD_C3_SUPERMINI)
  // Many C3 SuperMini boards have a poorly matched antenna; full TX power makes Wi-Fi unreliable.
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
#endif
}

static String macSuffix(bool upper) {
  const uint64_t mac = ESP.getEfuseMac();
  char buf[8];
  snprintf(buf, sizeof(buf), upper ? "%02X%02X" : "%02x%02x", (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
  return buf;
}

static String makeApName() { return "DisplayEditor-" + macSuffix(true); }

// Unique per board, so two boards on one network don't fight over the same .local name.
static String defaultName() { return "display-" + macSuffix(false); }

// "Kitchen Eyes" -> "kitchen-eyes". Names without ASCII letters/digits fall back to the default.
static void deriveHost(const String& name) {
  size_t n = 0;
  bool dash = false;
  for (size_t i = 0; i < name.length() && n < sizeof(host) - 1; i++) {
    char ch = name[i];
    if (ch >= 'A' && ch <= 'Z') ch += 'a' - 'A';
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) {
      if (dash && n) host[n++] = '-';
      if (n < sizeof(host) - 1) host[n++] = ch;
      dash = false;
    } else {
      dash = true;
    }
  }
  host[n] = 0;
  if (!n) strlcpy(host, defaultName().c_str(), sizeof(host));
}

static void loadName() {
  Preferences p;
  devName = p.begin("device", true) ? p.getString("name", "") : String();
  p.end();
  if (devName.isEmpty()) devName = defaultName();
  deriveHost(devName);
}

static void startMdns() {
  if (!MDNS.begin(host)) return;
  MDNS.addService("http", "tcp", 80);
  MDNS.addServiceTxt("http", "tcp", "name", devName.c_str());
}

static void startAP() {
  WiFi.mode(WIFI_AP);
  applyTxPower();
  WiFi.softAP(apName.c_str(), kApPassword);
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(53, "*", WiFi.softAPIP());  // every hostname resolves to us: captive portal
  apMode = true;
}

void begin(StatusFn onStatus) {
  apName = makeApName();
  loadName();
  WiFi.persistent(false);
  const auto saved = credentials();
  const String ssid = saved.ssid;
  if (ssid.length()) {
    const String pass = saved.password;
    char line[48];
    snprintf(line, sizeof(line), "Wi-Fi: %s", ssid.c_str());
    if (onStatus) onStatus(line);
    WiFi.mode(WIFI_STA);
    applyTxPower();
    WiFi.setHostname(host);
    WiFi.begin(ssid.c_str(), pass.c_str());
    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < kConnectTimeoutMs) delay(100);
    if (WiFi.status() != WL_CONNECTED) {
      if (onStatus) onStatus("Wi-Fi failed, AP mode");
      WiFi.disconnect(true);
      delay(100);
      startAP();
    }
  } else {
    startAP();
  }
  startMdns();
}

void loop() {
  if (apMode) dns.processNextRequest();
}

bool isAP() { return apMode; }
String ssid() { return apMode ? apName : WiFi.SSID(); }
String ip() { return apMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString(); }
int rssi() { return apMode ? 0 : WiFi.RSSI(); }
const char* apPassword() { return kApPassword; }
const char* hostname() { return host; }
const String& name() { return devName; }

bool saveName(const String& raw) {
  String next = raw;
  next.trim();
  if (next.length() > kMaxNameBytes) return false;
  for (size_t i = 0; i < next.length(); i++) {
    if ((uint8_t)next[i] < 0x20 || next[i] == 0x7f) return false;
  }
  Preferences p;
  if (!p.begin("device", false)) return false;
  // Empty = back to the default name.
  const bool saved = next.isEmpty() ? (p.remove("name") || !p.isKey("name")) : p.putString("name", next) == next.length();
  p.end();
  if (!saved) return false;
  loadName();
  MDNS.end();  // re-announce under the new name right away (DHCP hostname follows on reboot)
  startMdns();
  return true;
}

String savedSsid() {
  return credentials().ssid;
}

bool saveCredentials(const String& ssid, const String& pass) {
  if (ssid.length() > 32 || pass.length() > 64) return false;
  StoredCredentials stored{1, {}, {}};
  strlcpy(stored.ssid, ssid.c_str(), sizeof(stored.ssid));
  strlcpy(stored.password, pass.c_str(), sizeof(stored.password));
  Preferences p;
  if (!p.begin("wifi", false)) return false;
  const bool saved = p.putBytes("credentials", &stored, sizeof(stored)) == sizeof(stored);
  p.end();
  return saved;
}

bool forgetCredentials() {
  Preferences p;
  if (!p.begin("wifi", false)) return false;
  const bool saved = p.clear();
  p.end();
  return saved;
}

void scanJson(JsonObject out) {
  const int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_FAILED) {
    if (apMode) WiFi.mode(WIFI_AP_STA);  // scanning needs the station interface
    WiFi.scanNetworks(true);
    out["scanning"] = true;
    return;
  }
  if (n == WIFI_SCAN_RUNNING) {
    out["scanning"] = true;
    return;
  }
  JsonArray list = out["networks"].to<JsonArray>();
  for (int i = 0; i < n; i++) {
    const String s = WiFi.SSID(i);
    if (s.isEmpty()) continue;
    bool dup = false;
    for (JsonObject o : list) dup |= o["ssid"] == s;
    if (dup) continue;
    JsonObject o = list.add<JsonObject>();
    o["ssid"] = s;
    o["rssi"] = WiFi.RSSI(i);
    o["secure"] = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
  }
  WiFi.scanDelete();
  out["scanning"] = false;
}

}  // namespace wifi
