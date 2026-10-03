# USB serial protocol (version 1)

The editor can manage a board through Web Serial without a Wi-Fi connection. Open the editor on localhost or HTTPS in a browser exposing `navigator.serial`, then use **บอร์ด → เชื่อมผ่าน USB** (Board → Connect over USB), or the USB control on the remote page. Select the ESP32 native USB port (vendor ID `0x303a`). Close any serial monitor using that port first.

The client opens at 115200 baud and releases DTR/RTS. Each request and response is one UTF-8 line beginning with `@`, followed by JSON and a newline. Unprefixed lines are firmware logs. Responses echo `id` and contain an HTTP-style `status`; JSON results/errors are in `body`.

| Operation | Request fields | Result |
|---|---|---|
| `hello` | `id` | `body: {proto: 1, version}` |
| `api` | `method`, `path`, optional `query` and `body` | Same JSON API as HTTP; query values are strings |
| `put_begin` | `kind: "file" | "live"`, `size`; files also have `name`, `play` | Starts a single transfer |
| `put_data` | `data` (base64) | Appends up to 3072 decoded bytes |
| `put_end` | none | Validates and queues data; files return `body.upload_id` |
| `put_abort` | none | Closes/removes temporary data and frees live RAM |
| `read` | `name`, `offset`, `length` | Base64 `data`, plus total file `size`; max 3072 bytes per request |

The browser serialises **whole operations** on a link: uploads, live frames, reads and JSON commands cannot interleave. An upload includes polling `/api/uploads/status` until its commit is saved or failed. Settings updates include polling `/api/commands/status` using `body.command_id`; a display/Wi-Fi reboot is deferred until this acknowledgement can be returned. The firmware supports one transfer at a time; starting a new transfer cancels its predecessor. Transfers idle for 30 seconds are discarded. Live frames are limited to 96 KB and exactly one DPA frame.

Disconnecting rejects outstanding requests immediately. The UI clears its board/live state and offers reconnection. Display/Wi-Fi changes reboot the board; the Board dialog can reopen an already granted USB port while waiting for it to return. No browser port permission is requested automatically on first use.
