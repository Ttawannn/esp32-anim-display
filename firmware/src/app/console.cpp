#include "console.h"

#include <Arduino.h>

#include "app.h"
#include "bench/bench.h"
#include "board.h"
#include "commands.h"
#include "controller.h"
#include "net/wifi_manager.h"
#include "serial_rpc.h"
#include "storage/storage.h"

static void saveAndReboot() {
  configSave(appConfig());
  Serial.println("saved, rebooting...");
  Serial.flush();
  delay(200);
  ESP.restart();
}

static void printConfig() {
  const DisplayConfig& cfg = appConfig();
  const Preset& pr = kPresets[cfg.preset];
  const BoardPins& p = cfg.pins;
  Panel* panel = appPanel();
  Serial.printf("firmware %s on %s\n", FIRMWARE_VERSION, BOARD_NAME);
  Serial.printf("preset  [%u] %s - %s\n", cfg.preset, pr.id, pr.name);
  Serial.printf("display %s\n", appPanelOk() ? "ok" : (panel && panel->error() ? panel->error() : "FAILED"));
  Serial.printf("rot %u  offset %d,%d  invert %d  bgr %d  mirror %d  brightness %u\n", cfg.rotation, cfg.offX,
                cfg.offY, cfg.invert, cfg.bgr, cfg.mirrorX, cfg.brightness);
  if (pr.driver == Driver::SpiRgb565) {
    Serial.printf("spi %.1f MHz mode %u\n", cfg.spiHz / 1e6, cfg.spiMode);
  } else {
    Serial.printf("i2c %u kHz addr 0x%02X\n", (unsigned)(cfg.i2cHz / 1000), cfg.i2cAddr);
  }
  Serial.printf("pins clk %d data %d cs %d dc %d rst %d bl %d\n", p.clk, p.data, p.cs, p.dc, p.rst, p.bl);
  Serial.printf("wifi %s %s  http://%s  http://%s.local\n", wifi::isAP() ? "AP" : "STA", wifi::ssid().c_str(),
                wifi::ip().c_str(), wifi::hostname());
  Serial.printf("storage %u KB free of %u KB\n", (unsigned)(storage::freeBytes() / 1024),
                (unsigned)(storage::totalBytes() / 1024));
  Serial.printf("heap %u free, %u min, %u largest block\n", ESP.getFreeHeap(), ESP.getMinFreeHeap(), ESP.getMaxAllocHeap());
  Player& pl = controllerPlayer();
  Serial.printf("player %s %s frame %u/%u %.1f fps\n", pl.active() ? "playing" : "idle", pl.name().c_str(),
                pl.frameIndex(), pl.frameCount(), pl.fps());
}

static void printHelp() {
  Serial.println(
      "playback:\n"
      "  ls                      list animations\n"
      "  play <name>  stop  next  info\n"
      "wifi:\n"
      "  wifi <ssid> [password]  join a network (reboots)\n"
      "  wifi forget             back to AP mode (reboots)\n"
      "display (settings save and reboot):\n"
      "  presets  preset <n|id>  show  test  bench\n"
      "  rot <0-3>  offset <x> <y>  invert <0|1>  bgr <0|1>  mirror <0|1>\n"
      "  spi <MHz>  spimode <0-3>  i2c <kHz>  addr <hex>\n"
      "  pins <clk> <data> <cs> <dc> <rst> <bl>   (-1 = not connected)\n"
      "  bright <0-255>\n"
      "  reset                   factory defaults for the display (reboots)");
}

static void handleCommand(char* line) {
  char* cmd = strtok(line, " ");
  if (!cmd) return;
  auto arg = []() { return strtok(nullptr, " "); };
  auto argInt = [&](long def) -> long { char* a = arg(); return a ? strtol(a, nullptr, 0) : def; };
  DisplayConfig& cfg = appConfig();
  Panel* panel = appPanel();

  if (!strcmp(cmd, "help") || !strcmp(cmd, "?")) {
    printHelp();
  } else if (!strcmp(cmd, "ls")) {
    for (const auto& a : storage::list())
      Serial.printf("  %-30s %7u B  %ux%u  %u frames\n", a.name.c_str(), (unsigned)a.size, a.width, a.height, a.frames);
  } else if (!strcmp(cmd, "play")) {
    char* rest = strtok(nullptr, "");  // names may contain spaces
    if (rest) controllerPlay(storage::sanitizeName(rest));
  } else if (!strcmp(cmd, "stop")) {
    controllerStop();
  } else if (!strcmp(cmd, "next")) {
    controllerNext();
  } else if (!strcmp(cmd, "info")) {
    controllerShowInfo(15000);
  } else if (!strcmp(cmd, "wifi")) {
    char* ssid = arg();
    if (!ssid) {
      Serial.println("usage: wifi <ssid> [password] | wifi forget");
    } else if (!strcmp(ssid, "forget")) {
      wifi::forgetCredentials();
      ESP.restart();
    } else {
      char* pass = arg();
      wifi::saveCredentials(ssid, pass ? pass : "");
      Serial.println("saved, rebooting...");
      Serial.flush();
      ESP.restart();
    }
  } else if (!strcmp(cmd, "presets")) {
    for (size_t i = 0; i < kPresetCount; i++)
      Serial.printf("%c [%u] %-18s %s\n", i == cfg.preset ? '*' : ' ', (unsigned)i, kPresets[i].id, kPresets[i].name);
  } else if (!strcmp(cmd, "preset")) {
    char* a = arg();
    const int idx = !a ? -1 : isdigit((unsigned char)a[0]) ? atoi(a) : findPreset(a);
    if (idx < 0 || idx >= (int)kPresetCount) return (void)Serial.println("unknown preset");
    configApplyPreset(cfg, idx);
    saveAndReboot();
  } else if (!strcmp(cmd, "show")) {
    printConfig();
    benchPrint();
  } else if (!strcmp(cmd, "test")) {
    commandPost(Cmd::TestPattern);  // shown for 10 s, then playback resumes
  } else if (!strcmp(cmd, "bench")) {
    if (!appPanelOk()) return (void)Serial.println("bench: display not initialised");
    controllerStop();
    Serial.println("bench: running...");
    benchRun(*panel);
    benchPrint();
    controllerResume();
  } else if (!strcmp(cmd, "rot")) {
    cfg.rotation = argInt(0) & 3;
    saveAndReboot();
  } else if (!strcmp(cmd, "offset")) {
    cfg.offX = argInt(cfg.offX);
    cfg.offY = argInt(cfg.offY);
    saveAndReboot();
  } else if (!strcmp(cmd, "invert")) {
    cfg.invert = argInt(!cfg.invert);
    saveAndReboot();
  } else if (!strcmp(cmd, "bgr")) {
    cfg.bgr = argInt(!cfg.bgr);
    saveAndReboot();
  } else if (!strcmp(cmd, "mirror")) {
    cfg.mirrorX = argInt(!cfg.mirrorX);
    saveAndReboot();
  } else if (!strcmp(cmd, "spi")) {
    cfg.spiHz = (uint32_t)(atof(arg() ?: "40") * 1e6);
    saveAndReboot();
  } else if (!strcmp(cmd, "spimode")) {
    cfg.spiMode = argInt(0) & 3;
    saveAndReboot();
  } else if (!strcmp(cmd, "i2c")) {
    cfg.i2cHz = argInt(400) * 1000;
    saveAndReboot();
  } else if (!strcmp(cmd, "addr")) {
    char* a = arg();
    cfg.i2cAddr = a ? strtol(a, nullptr, 16) : 0x3C;
    saveAndReboot();
  } else if (!strcmp(cmd, "pins")) {
    BoardPins& p = cfg.pins;
    p.clk = argInt(p.clk); p.data = argInt(p.data); p.cs = argInt(p.cs);
    p.dc = argInt(p.dc); p.rst = argInt(p.rst); p.bl = argInt(p.bl);
    saveAndReboot();
  } else if (!strcmp(cmd, "bright")) {
    cfg.brightness = constrain(argInt(255), 0, 255);
    if (appPanelOk()) panel->setBrightness(cfg.brightness);
    configSave(cfg);
  } else if (!strcmp(cmd, "reset")) {
    configErase();
    Serial.println("display settings reset, rebooting...");
    Serial.flush();
    ESP.restart();
  } else {
    Serial.printf("unknown command '%s' (type help)\n", cmd);
  }
}

// Lines starting with '@' are USB RPC requests from the web editor (base64 chunks of a few KB);
// everything else is a console command.
void consolePoll() {
  serialRpcPoll();
  static char line[6144];
  static size_t len = 0;
  static bool overflow = false;
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\r' || c == '\n') {
      if (len && !overflow) {
        line[len] = 0;
        if (line[0] == '@') {
          serialRpcHandle(line + 1);
        } else {
          Serial.printf("> %s\n", line);
          handleCommand(line);
        }
      }
      len = 0;
      overflow = false;
    } else if (len < sizeof(line) - 1) {
      line[len++] = c;
    } else {
      overflow = true;  // drop the whole line
    }
  }
}
