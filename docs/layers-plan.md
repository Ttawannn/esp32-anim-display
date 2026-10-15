# Plan: drawing layers that move and scale as objects

Status: phases 1 and 2 implemented; not yet tried on a real board. Scope is the web editor only (`web/`). The `.dpa` format, the firmware and the
REST API do not change: the board still receives flattened frames.

## Goal

- Part of a drawing (or the whole drawing) can be turned into an **object**: a paint layer that
  moves and scales without being redrawn, like a Photoshop layer.
- New, empty paint layers can be added and drawn on directly.
- Paint layers sit in the same list as stickers and clocks: reorder, hide, duplicate, delete, merge
  back into the drawing.

## Design

### The background stays as it is

`Frame.data` remains the frame's background drawing, so templates, importers, the encoder and old
projects keep working without migration. Paint layers are an addition on top of it.

### Data model (`model/types.ts`)

```ts
interface Frame { id; data; delay; cels?: Record<string, Cel> } // paint layer pixels per frame
interface Cel { x; y; w; h; data: Pixels }                       // trimmed, in layer pixels
interface PaintLayer { kind: 'paint'; id; name; x; y; scale; hidden? }
type Layer = PaintLayer | StickerLayer | ClockLayer;              // every kind gains `hidden?`
```

- A paint layer has **one transform for all frames**: origin `x, y` in canvas pixels and `scale`
  (nearest neighbour). Moving or resizing the object changes only these numbers, so it never
  redraws pixels and nothing is lost past the canvas edge.
- Each frame holds the layer's own pixels as a trimmed `Cel` in layer pixels. Cels are immutable;
  duplicating a frame shares them by reference. A frame without a cel shows nothing for that layer.
- The move tool (`M`) with a paint layer selected moves only **this frame's** cel (animating an
  object frame by frame); the select tool (`V`) moves the whole layer on every frame.
- Clocks stay on top of everything (the board draws them over the finished frame).

### Rendering (`layers/paint.ts`, `layers/raster.ts`)

- `paint.ts`: pure pixel code (works in the encode worker and tests): `compositeCel` (scaled
  nearest neighbour, sampled at pixel centres), `trimCel`, `celInto`, `flipCel`, `liftPixels`,
  `celAlphaAt` for hit tests.
- `bakeLayers(p, frame)` composites visible paint layers and stickers in list order over
  `frame.data`. Cached per frame buffer, keyed by `bakeKey(p)` (visible baked layers) and the
  frame's `cels` identity. `processFrame`, the quantization cache and `EncodingCache` compare `cels`
  identity too.
- The editor canvas shows the baked frame (same pixels as the panel), plus the clock overlay and
  the selection box.

### Editing (`ui/EditorCanvas.tsx`, `model/layers.ts`)

- **Drawing target:** the selected layer when it is a visible paint layer, otherwise the background.
  Drawing on a paint layer works in layer pixels (a scaled layer gets chunky pixels): the cel is
  expanded to cover the canvas while drawing and trimmed on release. Mirror drawing mirrors around
  the canvas centre.
- **Select tool (`V`):** a click picks the topmost visible layer under the cursor (pixel-accurate
  for paint layers, box for stickers and clocks) and drags it. The bottom-right handle resizes:
  `scale` for paint layers (snaps to whole numbers near them), `size` for stickers and clocks.
  Dragging on an empty spot draws a rectangle and **lifts the drawing inside it into a new object**
  (this frame, or every frame when "every frame" is on in the Layers tab).
- **Arrow keys** nudge the selected layer; Delete removes it.
- **Flip H/V** flip the selected paint layer's cel on this frame around its own centre.
- **Picker** samples the visible result.
- **Drawing on a sticker:** with an emoji / icon / text selected, the first stroke turns it into a
  paint layer in the same place (`rasterizeSticker`, one cel shared by every frame; Ctrl+Z undoes
  it). The sticker panel also has a "Draw on it" button. Strokes then change only the current
  frame's cel, like any paint layer.

### Layers tab (`ui/LayersPanel.tsx`)

- New side tab next to Insert. The list (top to bottom) has an eye toggle per layer and a
  "Background" row at the bottom (selecting it = drawing on the background).
- Buttons: new empty layer, turn the whole drawing into an object (this frame / every frame),
  lift scope toggle.
- Selected paint layer: name, scale slider with 1× / 2× shortcuts, duplicate, bring to front /
  send to back, merge into the background (this frame / every frame), delete.
- Selected sticker or clock: the existing property editor (moved out of the Insert tab's list).

### Persistence

- IndexedDB restore keeps `cels`.
- `.dpe` stays `DPE1`: frame entries gain `cels: { [layerId]: { x, y, w, h, b } }` where `b`
  indexes raw RGBA buffers appended after the frames; shared cels are written once. Older files
  have no `cels` and load unchanged.

### Other readers

- Timeline thumbnails show the baked frame (refreshed with a short debounce while dragging).
- Colors tab: used colors and "replace color" include paint layer cels.
- The blank-project check also looks at cels.

## Steps

1. Model and rendering: types, `paint.ts`, frame-aware `bakeLayers`, cache keys. *(done)*
2. Layer actions: lift, new layer, merge, duplicate/remove with cels, cel move, flip. *(done)*
3. Canvas: draw on paint layers, pixel hit test, move/resize, marquee lift. *(done)*
4. Layers tab UI. *(done)*
5. Persistence, thumbnails, palette, Thai strings. *(done)*
6. Tests (`layers/paint.test.ts`: cels, baking, `.dpe` round trip), typecheck, browser check. *(done)*
7. Docs (`CLAUDE.md` layers section, `docs/architecture.md`), `npm run build:device`. *(done)*

## Phase 2: one word, layered templates

### One concept: "layer"

Everything placed on the picture (drawings, emoji / icons / text, clocks) is a **layer** in the UI,
in English and Thai ("เลเยอร์"). The words "object", "วัตถุ" and "ของที่ใส่" are gone from the UI.
The background drawing is the "Background" row at the bottom of the Layers tab, not a layer.
Internally the three kinds stay (`paint`, `sticker`, `clock`).

### Templates arrive as layers

`templateProject` (and `eyeProject`) turn generated frames into layers so a template can be moved,
resized, hidden or drawn on right away:

- **Generic split (every template):** the most common colour across all frames (when it covers at
  least a quarter of the pixels) becomes the project background. Every other pixel goes into a paint
  layer named after the template, one trimmed cel per frame; the background drawing starts empty.
  Full-screen effects with no dominant colour (plasma, fire) become one layer as they are.
- **Named parts:** a generator may return `parts: { name, frames }[]`, frames drawn on transparent
  images, stacked bottom to top over its background frames. Used where a template has separate
  things: Pac-Man (dots, ghost, Pac-Man), bouncing ball (shadow, ball), eyes (left eye, right eye,
  split at the canvas centre; one eye on round screens).
- Clock templates keep their clock layers on top.
- Output on the board is unchanged: baking the layers over the background reproduces the
  generated frames (`gallery.test.ts` checks this pixel for pixel on every pure-pixel template
  without parts, on every display).
- `eyeProject` (mood sets installed straight to the board) stays flat: nobody edits those.

## Later

- Free transform with rotation, marquee copy/paste between layers, per-layer opacity.
- Eye templates producing separate layers (eyes / pupils / lids).
