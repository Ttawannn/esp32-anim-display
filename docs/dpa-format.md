# DPA — Display Animation file format (version 1)

The animation file that the web editor writes and the firmware plays. All values are **little-endian**.
Frames are prepared for the target display in advance; the board only decodes them and puts them on the screen.

## Layout

```
Header        32 bytes
Palette       palette_size × u16 (RGB565)
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
| 26 | u16 | reserved | 0 |
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
