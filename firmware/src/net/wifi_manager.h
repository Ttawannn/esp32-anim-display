#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Joins the saved network (STA). Without saved credentials, or if joining fails, the board
// starts its own access point with a captive portal so a phone lands on the editor directly.
namespace wifi {

using StatusFn = void (*)(const char* line);

void begin(StatusFn onStatus);
void loop();

bool isAP();
String ssid();  // joined network, or our AP name
String ip();
int rssi();
const char* apPassword();
const char* hostname();
String savedSsid();

void saveCredentials(const String& ssid, const String& pass);
void forgetCredentials();

// Starts an async scan on first call; later calls return {"scanning":true} or the results.
void scanJson(JsonObject out);

}  // namespace wifi
