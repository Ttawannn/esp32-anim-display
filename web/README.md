# Web editor

Creates and edits animations for the ESP32 displays. Runs entirely in the browser (Vite + Preact + TypeScript, about 41 KB gzipped). The firmware embeds this editor and serves it from the board. The user interface is in Thai.

## Running

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:5173.

### Connecting to a board

- **Served from the board:** when you open the editor from the board itself, it connects automatically.
- **Running locally:** while your computer is on the board's Wi-Fi, enter the board's IP (e.g. `192.168.4.1`) in the **บอร์ด** (Board) dialog, or proxy the API through the dev server:

  ```bash
  DEVICE=192.168.4.1 npm run dev
  ```

### Without a board

[`scripts/mock-board.mjs`](scripts/mock-board.mjs) is an in-memory fake board that implements the firmware API. Run these in separate terminals:

```bash
npm run mock-board
```

```bash
npm run dev:mock
```

### Other commands

| Command | Does |
|---------|------|
| `npm test` | codec unit tests; also regenerates `shared/test-vectors` |
| `npm run typecheck` | TypeScript check |
| `npm run build` | production build into `dist/` |
| `npm run build:device` | build and embed it into the firmware (`firmware/src/net/web_assets.h`) |

## Features

- **Pixel art:**
  - tools: pencil, eraser, line, rectangle, ellipse, fill, color picker, move
  - options: mirror drawing, flip, 1–3 px brush, onion skin, undo/redo
- **Frames:** add, duplicate, delete, reorder; set the delay per frame or the fps for all frames; loop playback.
- **Eye templates:** generates eye animations in 12 moods:
  - moods: look left-right, look around, blink, happy, sad, angry, surprised, sleepy, in love, wink, suspicious, dizzy
  - 3 styles: robot, cartoon, single eye for round displays
  - adjustable: color, size, spacing, fps, resolution, and rotation for sideways-mounted displays
  - all moods can be combined into one animation
- **GIF import:**
  - keep the native size (pixel art scaled by an integer factor), or fit to the screen (contain / cover / stretch, zoom, pan)
  - trim frames and change the speed
- **Video import:**
  - choose the time range, fps and resolution; crop, zoom and pan
  - shows the estimated file size before importing
  - converted in the browser; nothing is uploaded anywhere
- **Colors:** palette presets (PICO-8, Sweetie 16, NES, Game Boy), replace a color across all frames, background color.
- **Color adjustment (TFT):** brightness, contrast, saturation, hue, invert, color limit.
- **Black and white (OLED):** threshold, 4 dithering modes, invert, and a preview of the OLED's color (white / blue / yellow-blue).
- **Display preview:** shows exactly what the panel will show (RGB565 / 1-bit, scaling, position, round mask). Switch the target display at any time.
- **Export:**
  - `.dpa` files ([format](../docs/dpa-format.md)), Indexed (sharp) or JPEG (video)
  - shows the size relative to the board's free space
- **Board:**
  - upload and play
  - live preview on the real display while editing
  - board manager: files, playlist, display settings, Wi-Fi
- **Projects:** autosaved in the browser; save and open `.dpe` files.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| B E L R O G I M | pencil, eraser, line, rectangle, ellipse, fill, picker, move |
| Right click | draw with the secondary color |
| X | swap primary and secondary colors |
| Space | play / pause |
| ← → | previous / next frame |
| D / N | duplicate frame / new blank frame |
| Delete | delete frame |
| Ctrl+Z / Ctrl+Y | undo / redo |
| + / − or Ctrl+mouse wheel | zoom |

## Structure

```
src/
  model/     project, display presets, palettes, store (state + undo + autosave)
  editor/    drawing tools (pure functions on RGBA buffers)
  templates/ procedurally generated animations (eyes)
  color/     RGB565, color adjustment, dithering, color reduction
  render/    the image the panel will actually show + display preview
  codec/     RLE + .dpa writer/reader (unit tests, test vectors)
  import/    GIF decoding, video frame extraction, resampling
  device/    board REST client, auto-connect, live preview
  storage/   IndexedDB, .dpe project files
  ui/        Preact components
```
