import { expand565Table, to565 } from '../color/rgb565';
import { getPreset } from '../model/presets';
import { hexToRgb } from '../model/project';
import type { OledTint, Project } from '../model/types';
import type { OutFrame } from './output';

const OLED_OFF = [6, 8, 12];
const OLED_ON: Record<OledTint, number[][]> = {
  white: [[235, 240, 255]],
  blue: [[90, 200, 255]],
  'yellow-blue': [[255, 214, 60], [90, 200, 255]], // top 16 rows yellow on two-color modules
};

// Renders an output frame onto a screen-sized ImageData exactly as the panel would place it:
// scaled by `scale`, positioned at the project offset, background around it.
export function composeScreen(p: Project, frame: OutFrame, tint: OledTint = 'white'): ImageData {
  const preset = getPreset(p.presetId);
  const sw = preset.width, sh = preset.height;
  const img = new ImageData(sw, sh);
  const d = new Uint32Array(img.data.buffer); // little-endian: 0xAABBGGRR
  const pack = (r: number, g: number, b: number) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;

  let bgPix: number, onPix: number[] = [], offPix = 0;
  if (frame.kind === 'mono') {
    offPix = pack(OLED_OFF[0], OLED_OFF[1], OLED_OFF[2]);
    onPix = OLED_ON[tint].map(([r, g, b]) => pack(r, g, b));
    const [r, g, b] = hexToRgb(p.background);
    bgPix = (r * 77 + g * 150 + b * 29) >> 8 >= 128 ? onPix[0] : offPix;
  } else {
    const [r, g, b] = hexToRgb(p.background);
    const c = expand565Table()[to565(r, g, b)];
    bgPix = pack(c >> 16, (c >> 8) & 255, c & 255);
  }
  d.fill(bgPix);

  const table = frame.kind === 'rgb565' ? expand565Table() : null;
  const { width: cw, height: ch, scale: s, offsetX: ox, offsetY: oy } = p;
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const i = cy * cw + cx;
      let pix: number;
      if (frame.kind === 'mono') {
        pix = frame.bits[i] ? -1 : offPix;
      } else {
        const c = table![frame.px[i]];
        pix = pack(c >> 16, (c >> 8) & 255, c & 255);
      }
      const x0 = ox + cx * s, y0 = oy + cy * s;
      for (let dy = 0; dy < s; dy++) {
        const y = y0 + dy;
        if (y < 0 || y >= sh) continue;
        const onRow = onPix[onPix.length > 1 && y < 16 ? 0 : onPix.length - 1];
        const value = pix === -1 ? onRow : pix;
        for (let dx = 0; dx < s; dx++) {
          const x = x0 + dx;
          if (x >= 0 && x < sw) d[y * sw + x] = value;
        }
      }
    }
  }
  if (preset.round) maskRound(d, sw, sh);
  return img;
}

function maskRound(d: Uint32Array, w: number, h: number) {
  const cx = (w - 1) / 2, cy = (h - 1) / 2, r = w / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) d[y * w + x] = 0x00000000;
    }
}
