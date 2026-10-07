// Display Editor firmware: plays .dpa animations made in the web editor on ESP32-C3 / C6 SuperMini.
//
// BOOT button: short press = next animation, hold 2 s = show Wi-Fi / address info,
//              hold while the boot screen is shown = safe mode (display settings reset)
// Wi-Fi: joins the saved network, otherwise starts AP "DisplayEditor-XXXX" (password "displayedit").
//        The editor is served at http://<ip>/ or http://display.local
// Serial console (115200): type "help".

#include <Arduino.h>
#include <Wire.h>

#include "app/app.h"
#include "app/clock.h"
#include "app/commands.h"
#include "app/console.h"
#include "app/controller.h"
#include "app/screens.h"
#include "app/settings.h"
#include "board.h"
#include "config.h"
#include "display/gfx.h"
#include "display/panel.h"
#include "net/web.h"
#include "net/wifi_manager.h"
#include "storage/storage.h"

static DisplayConfig cfg;
static Panel* panel = nullptr;
static bool panelOk = false;
static bool displayStored = false;
static const char* displayDetected = nullptr;

DisplayConfig& appConfig() { return cfg; }
Panel* appPanel() { return panel; }
bool appPanelOk() { return panelOk; }
bool appDisplayConfigured() { return displayStored; }
const char* appDisplayDetected() { return displayDetected; }

// An SSD1306/SH1106 answers on I2C at 0x3C/0x3D. TFT modules are write-only, so they cannot be
// identified; no answer means "probably a TFT". Runs before any display driver starts.
static bool probeOled(const BoardPins& pins) {
  if (pins.clk < 0 || pins.data < 0 || !Wire.begin(pins.data, pins.clk, 100000)) return false;
  bool found = false;
  for (uint8_t addr : {0x3C, 0x3D}) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) { found = true; break; }
  }
  Wire.end();
  return found;
}

static void ledSet(uint8_t r, uint8_t g, uint8_t b) {
  if (LED_IS_RGB) {
    rgbLedWrite(PIN_LED, r / 8, g / 8, b / 8);  // WS2812 at full power is blinding
  } else {
    pinMode(PIN_LED, OUTPUT);
    const bool on = r | g | b;
    digitalWrite(PIN_LED, on != LED_ACTIVE_LOW ? HIGH : LOW);
  }
}

static void bootStatus(const char* line) {
  Serial.println(line);
  if (panelOk) screenBoot(*panel, line);
}

// BOOT (GPIO9, GPIO0 on the ESP32) is a strapping pin: holding it through reset enters the ROM bootloader, so safe mode is
// triggered by pressing it while the boot screen is shown instead.
static void checkSafeMode() {
  bootStatus("hold BOOT: safe mode");
  const uint32_t start = millis();
  while (millis() - start < 1500) {
    if (digitalRead(PIN_BUTTON) == LOW) {
      Serial.println("SAFE MODE: display settings reset");
      configErase();
      ledSet(255, 0, 255);
      while (digitalRead(PIN_BUTTON) == LOW) delay(10);
      ESP.restart();
    }
    delay(10);
  }
}

static void pollButton() {
  static bool wasDown = false, longFired = false;
  static uint32_t downAt = 0;
  const bool down = digitalRead(PIN_BUTTON) == LOW;
  const uint32_t now = millis();
  if (down && !wasDown) {
    downAt = now;
    longFired = false;
  } else if (down && !longFired && now - downAt >= 2000) {
    longFired = true;
    controllerShowInfo(15000);
  } else if (!down && wasDown && !longFired && now - downAt >= 30) {
    controllerNext();
  }
  wasDown = down;
}

void setup() {
  Serial.setRxBufferSize(8192);  // USB RPC lines are a few KB (see app/serial_rpc)
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  ledSet(255, 0, 0);
  const uint32_t serialWait = millis();
  while (!Serial && millis() - serialWait < 1000) delay(10);  // USB CDC: give the monitor a chance (UART: at once)

  const bool stored = configLoad(cfg);
  displayStored = stored;
  if (!stored) {
    // Never configured: an OLED on the default pins is detectable, so start with it rather than a TFT.
    const bool oled = probeOled(cfg.pins);
    displayDetected = oled ? "oled" : "tft";
    if (oled) configApplyPreset(cfg, (uint8_t)findPreset("ssd1306_128x64"));
    Serial.printf("display not configured yet, I2C probe: %s\n", oled ? "OLED found" : "no OLED (assuming TFT)");
  }
  Serial.printf("\n\nDisplay Editor %s - %s, display config %s\n", FIRMWARE_VERSION, BOARD_NAME,
                stored ? "from NVS" : "defaults");

  panel = createPanel(cfg);
  panelOk = panel && panel->begin();
  if (!panelOk) Serial.printf("display init FAILED: %s\n", panel && panel->error() ? panel->error() : "?");
  checkSafeMode();

  if (!storage::begin()) bootStatus("storage FAILED");
  commandsBegin();
  clockBegin();
  wifi::begin(bootStatus);
  if (!wifi::isAP()) clockStartNtp();
  webBegin();
  ledSet(wifi::isAP() ? 160 : 0, 0, 255);  // blue = joined Wi-Fi, purple = own AP
  Serial.printf("ready: http://%s  (%s %s)\n", wifi::ip().c_str(), wifi::isAP() ? "AP" : "Wi-Fi", wifi::ssid().c_str());
  Serial.println("type 'help' for commands");

  if (panelOk) {
    controllerBegin(panel);
  }
}

void loop() {
  consolePoll();
  settingsPoll();
  wifi::loop();
  if (panelOk) {
    pollButton();
    controllerLoop();
  } else {
    // No display: keep serving the API so the display settings can be fixed from the browser.
    Command c;
    while (commandTake(c)) {
      if (c.type == Cmd::Reboot) ESP.restart();
      if (c.type == Cmd::CommitUpload) commandCommitUpload(c);
      if (isSettingsCommand(c.type)) settingsApply(c);
      if (c.type == Cmd::Delete) storage::remove(c.name);
      if (c.type == Cmd::Rename && c.data) {
        const String from = (const char*)c.data;
        uploadComplete(c.uploadId, controllerRenameFile(from, (const char*)c.data + from.length() + 1), "cannot rename");
      }
      free(c.data);
    }
  }
  delay(1);
}
