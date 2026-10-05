# Board REST API

Every endpoint lives at `http://<board ip>/api/...` (or `http://<hostname>.local/api/...`, see [Board name](#wi-fi-and-system)) and responds with JSON.
Errors respond with `{"error": "..."}` and an appropriate HTTP status. CORS headers are always sent, so an editor running on a PC can call the board directly.

The JSON API is implemented in [firmware/src/net/api.cpp](../firmware/src/net/api.cpp), shared by HTTP and [USB serial](usb-protocol.md).
[web/scripts/mock-board.mjs](../web/scripts/mock-board.mjs) is a fake board that answers the same API.

## Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/info` | version, board `name`, `time` (board clock, unix seconds, 0 = unknown), board, display (`width`, `height`, `color`, `shape`), storage `fs`, Wi-Fi, player status |
| GET | `/api/commands/status?id=<id>` | settings receipt: `{state: "pending" | "saved" | "failed"}`; failures include `error` |

Display, Wi-Fi, board name, time, playlist and brightness updates return HTTP `202` with `{ok: true, command_id}`. The loop task saves and applies the queued settings; a full queue leaves persisted settings unchanged. Clients poll `/api/commands/status` before announcing success. Failed persistence returns a `failed` receipt and does not reboot. Display/Wi-Fi changes reboot 400 ms after a completed receipt is read, or after a 3-second grace period for clients that do not poll. The browser also supports older firmware returning no receipt. Settings and uploads share the 16-slot receipt pool.

## Animations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/anims` | `{anims: [{name, size, width, height, frames, color}], free}` |
| POST | `/api/anims?name=<n>&play=1` | upload a `.dpa` as multipart (field `file`); `play=0` stores it without playing |
| GET | `/api/uploads/status?id=<id>` | `{state: "pending" | "saved" | "failed"}`; failed saves include `error` |
| GET | `/api/anims/file?name=<n>&max=<bytes>` | download the file; with `max`, only its first bytes (used for thumbnails) |
| DELETE | `/api/anims?name=<n>` | delete |
| POST | `/api/anims/rename?name=<n>&to=<new>` | rename (confirmed: `202` + `command_id`); `409 name exists` if `<new>` is taken. The playlist and "last played" follow the new name |
| POST | `/api/play?name=<n>` | play this file (pauses the playlist) |
| POST | `/api/stop` | stop and clear the screen |
| POST | `/api/next` | next playlist item, or the next file |

Upload errors: `400` invalid file name, `415` invalid DPA structure/data, `507` insufficient space, `503` command queue full.
An accepted upload returns HTTP `202` with `{ok: true, name, size, upload_id}`. This means the commit is queued; poll its receipt until `saved` before reporting success. Receipts use a bounded 16-slot ring, and pending receipts are never overwritten. Older clients can still read `ok`; newer clients also support older firmware that returns no receipt.

Uploads require enough **free** storage for the whole temporary file plus 8 KB metadata headroom; replacing a file does not release the old file's space during transfer. Validation streams through all frame entries and RLE data, checks palette indices and frame bounds, and checks baseline JPEG structure and dimensions. JPEG pixel decoding remains the player's responsibility.

The loop task renames the old file to `.dpa.bak`, installs the validated temporary file, then removes the backup. If installation fails, it restores the old file; boot recovery retries unfinished recovery and cleans up interrupted temporary uploads. Upload commits and deletion also work while the display is unavailable.

HTTP disconnects discard temporary uploads immediately until ownership passes to a queued commit. A disconnect after acceptance leaves that commit intact.

Command endpoints return `503` when their command cannot be queued. Playback, test-pattern, live-preview and brightness requests also fail explicitly if the display did not initialise.

## Live preview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/live` | the body is a complete `.dpa` file (usually a single frame, at most 96 KB), shown immediately from RAM |
| POST | `/api/live/end` | return to whatever was playing before (the board also returns on its own after 60 seconds without a new frame) |

## Playlist

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/playlist` | `{enabled, shuffle, items: [{name, seconds}]}` |
| PUT | `/api/playlist` | save (same JSON). `seconds: 0` means play the animation once (or its own loop count), then move to the next item |

Playlist writes use `/playlist.tmp`, verify the complete JSON write, and replace `/playlist.json` with a recoverable `/playlist.json.bak`. Boot recovery restores an interrupted replacement. Wi-Fi SSID/password are stored together in one NVS blob; existing separate-key credentials remain readable until their next save.

## Display

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/display` | `{preset, rotation, offset_x, offset_y, invert, bgr, mirror_x, spi_hz, spi_mode, i2c_hz, i2c_addr, brightness, pins}` |
| PUT | `/api/display` | send only the fields to change; saves and then **reboots**. Changing `preset` resets the other tuning values to that preset's defaults |

`/api/info` → `display.configured` is `false` until the display settings have been saved once; the editor and the remote then open the setup wizard. While unconfigured, `display.detected` reports the first-boot I2C probe: `"oled"` (an SSD1306/SH1106 answered at 0x3C/0x3D; the board starts with the 128×64 OLED preset) or `"tft"` (no answer: TFT modules cannot be identified, the default 240×240 TFT is used).
| GET | `/api/display/presets` | `{presets: [{id, name, width, height, color, round}]}` |
| POST | `/api/display/test` | show the test pattern for 10 seconds |
| POST | `/api/brightness?value=0-255` | change brightness immediately and save it (no reboot) |

## Wi-Fi and system

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wifi` | `{mode: "ap"/"sta", ssid, ip, rssi, saved_ssid}` |
| PUT | `/api/wifi` | `{ssid, password}`; saves and then **reboots**. If joining fails within 15 seconds, the board falls back to its own AP |
| DELETE | `/api/wifi` | forget the network and return to AP mode (reboots) |
| GET | `/api/wifi/scan` | the first call returns `{scanning: true}`; call again until it returns `{scanning: false, networks: [{ssid, rssi, secure}]}` |
| GET | `/api/device` | `{name, hostname}`, e.g. `{"name": "Desk Eyes", "hostname": "desk-eyes.local"}` |
| PUT | `/api/device` | `{name}` (up to 48 UTF-8 bytes, no control characters; empty restores the default); saved and re-announced over mDNS immediately, no reboot |
| GET | `/api/time` | `{epoch, tz_minutes}`: board clock (unix seconds, 0 = unknown) and UTC offset in minutes east (420 = UTC+7) |
| PUT | `/api/time` | `{epoch, tz_minutes}`; sets the clock used by date/time widgets (no reboot). The editor and the remote do this automatically when the board's clock is unset or off by more than 3 s |
| POST | `/api/reboot` | reboot |

**Board name.** Each board has a name (default `display-xxxx`, the last four hex digits of its MAC, matching the AP name). The mDNS hostname is derived from it: ASCII letters and digits are lowercased, everything else becomes `-`, and the result is capped at 24 characters (`"Desk Eyes ห้องนอน"` → `desk-eyes.local`). A name with no ASCII letters or digits keeps the default hostname. Firmware older than 0.3.0 used the fixed hostname `display.local` and has no `/api/device`.

## Web page

`GET /` and `/assets/*` serve the editor embedded in the firmware (gzip, generated by `npm run build:device`).
In AP mode every URL outside `/api/` redirects to the editor (captive portal), so phones open the editor automatically after joining the board's Wi-Fi.
