# DPA — Display Animation file format (version 1)

The animation file that the web editor writes and the firmware plays. All values are **little-endian**.
Frames are prepared for the target display in advance; the board only decodes them and puts them on the screen.

## Layout

```
Header        32 bytes
Palette       palette_size × u16 (RGB565)
Widget block  optional (flags bit 0), see "Widget block"
Frame table   frame_count × 12 bytes
Frame data    ...
```

### Header (32 bytes)

| Offset | Type | Field | Meaning |
|-------:|------|-------|---------|
| 0 | char[4] | magic | `"DPA1"` |
| 4 | u8 | version | `1` |
| 5 | u8 | color_mode | `0` = RGB565, `1` = MONO (1 bit) |
| 6 | u16 | screen_w | target display width |
| 8 | u16 | screen_h | target display height |
| 10 | u16 | canvas_w | stored image width |
| 12 | u16 | canvas_h | stored image height |
| 14 | u8 | scale | nearest-neighbor upscale factor, 1..8 |
| 15 | u8 | loop | `0` = loop forever, `n` = play n times |
| 16 | i16 | offset_x | screen position of the image's top-left corner (after scaling); may be negative (cropped) |
| 18 | i16 | offset_y | |
| 20 | u16 | frame_count | |
| 22 | u16 | palette_size | 0..256 |
| 24 | u16 | bg_color | RGB565 for the area outside the image (MONO: 0 or 1) |
| 26 | u16 | flags | bit 0: a widget block follows the palette; other bits 0 |
| 28 | u32 | frame_table_offset | |

### Frame table entry (12 bytes)

| Offset | Type | Field |
|-------:|------|-------|
| 0 | u32 | data_offset (from the start of the file) |
| 4 | u32 | data_size |
| 8 | u16 | delay_ms |
| 10 | u8 | type |
| 11 | u8 | flags (bit0 = keyframe) |

The first frame must always be a keyframe, because looping back to frame 0 redraws the whole image.

## Frame types

All frame coordinates are **canvas** coordinates (before scaling). The board computes the screen position as
`screen_x = offset_x + x × scale`.

### type 0 — INDEXED

```
u16 x, u16 y, u16 w, u16 h      changed rectangle (w = 0 means the frame is unchanged, delay only)
RLE stream of indices (w × h bytes once decoded), row by row
```
Indices refer to the palette in the header.

### type 1 — JPEG

```
u16 x, u16 y, u16 w, u16 h
baseline JPEG (w × h)
```
Used for video and photos (`scale` should be 1).

### type 2 — MONO

```
u16 x, u16 y, u16 w, u16 h      y and h are multiples of 8
RLE stream of page bytes: one page (8 rows) at a time, ordered by x within each page,
bit 0 = top row of the page, 1 = pixel on
```
This matches the RAM layout of the SSD1306/SH1106, so with scale = 1 it can be sent to the display as-is.

## Widget block (live date/time)

Present when header flag bit 0 is set. It starts right after the palette and ends before `frame_table_offset`;
firmware older than 0.4.0 ignores it and plays the animation without the clock.

The editor pre-renders every glyph a clock can show; the board picks glyphs for its current local time and
blends them over each frame while the frame is sent to the panel. All values are little-endian.

```
 0  char[4] "WDG1"
 4  u32     block_size (whole block, at most 48 KB)
 8  u8      widget_count (1..8)
 9  u8      reserved, 0
10  u16     glyph_count (1..1024)
12  glyph table: glyph_count × { u16 w, u16 h, u32 data_offset (from the block start) }
..  widgets: widget_count × {
      i16 x, i16 y, u16 w, u16 h      text box on the screen (screen pixels); drawing is clipped to it
      u16 color                       RGB565 (MONO: 0 = pixel off, anything else = on)
      u8  align                       0 left, 1 centre, 2 right (text inside the box)
      u8  part_count                  1..32
      u16 digits                      glyph index of '0'; '0'..'9' and '-' are 11 consecutive glyphs of equal width
      u16 reserved
      parts: part_count × { u8 kind, u8 field, u16 glyph }
    }
..  glyph data: per glyph h rows of ceil(w/2) bytes, 4-bit alpha (high nibble = left pixel)
```

Parts, laid out left to right:

| kind | meaning | field | glyph |
|-----:|---------|-------|-------|
| 0 TEXT | fixed text | — | glyph index |
| 1 NUMBER | number drawn with the digit glyphs, zero-padded | 0 hour, 1 hour (12 h), 2 minute, 3 second, 4 day, 5 month, 6 year % 100, 7 year, 8 Buddhist-era year (year + 543) | minimum digits (1..4) |
| 2 NAME | one of several names | 0 weekday (7, Sunday first), 1 month (12), 2 AM/PM (2) | index of the first name glyph |

Rendering, identical in `web/src/layers/widgets.ts` and `firmware/src/player/widgets.h`:

- **Text start:** the total width is the sum of the glyph widths. The text starts at `x` (left), `x + (w − total) / 2`
  (centre, integer division truncating toward zero) or `x + w − total` (right).
- **Unknown time:** while the board does not know the time, NUMBER parts draw `'-'` per minimum digit and NAME parts draw nothing.
- **Clipping:** pixels are drawn only inside the box and inside the animation's canvas area on the panel.
- **Colour blend:** for alpha `a` = 1..15, each channel `c` is `(fg·a + bg·(15 − a) + 7) / 15` in RGB565 units.
- **1-bit panels:** a pixel is set to the widget colour when `a ≥ 8`.

**Every frame must repaint the canvas area under all widget boxes** (the encoder unions it into each frame's
rect). The panel has no framebuffer to read back, so when the time changes during a held frame the board
redraws that frame to restore the background before drawing the new digits.

## RLE (PackBits)

Read a control byte `c`:
- `c < 128` → `c + 1` literal bytes follow
- `c ≥ 128` → the next byte is repeated `c − 126` times (2..129)

## Typical sizes

| Content | Approx. size per frame |
|---------|------------------------|
| Pixel art 60×60 ×4, partial changes | 0.1–1 KB |
| GIF 240×240 indexed | 3–20 KB |
| Video 240×240 JPEG q≈70 | 8–12 KB |
| OLED 128×64 | 0.1–0.5 KB |
