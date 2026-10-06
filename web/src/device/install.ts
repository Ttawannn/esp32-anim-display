// Generate something for the connected board's display and put it on the board, playing.

import { encodeProject } from '../codec/encode';
import { EMOJI_FONT, fontCss } from '../layers/catalog';
import { getPreset } from '../model/presets';
import { createProject, newFrame } from '../model/project';
import type { Project } from '../model/types';
import { TEMPLATES, templateProject, type Options } from '../templates/gallery';
import { device, deviceFileName, presetForDevice, type DeviceInfo } from './api';
import { t } from '../i18n';

export function boardPresetId(info: DeviceInfo): string {
  return presetForDevice(info) ?? 'st7789_240x240';
}

// onProgress: 0..1 (encoding is the first 30%).
export async function installProject(host: string, p: Project, name: string, onProgress?: (f: number) => void): Promise<string> {
  const file = deviceFileName(name);
  const { bytes } = await encodeProject(p, (done, total) => onProgress?.((0.3 * done) / total));
  onProgress?.(0.3);
  await device.upload(host, file, bytes, true, (sent, total) => onProgress?.(0.3 + (0.7 * sent) / total));
  onProgress?.(1);
  return file;
}

export async function installTemplate(host: string, info: DeviceInfo, id: string, o: Options = {}, onProgress?: (f: number) => void) {
  const tpl = TEMPLATES.find((x) => x.id === id)!;
  return installProject(host, templateProject(tpl, boardPresetId(info), o), t(tpl.name), onProgress);
}

export const messageFile = () => t('Message');

export interface MessageOptions {
  text: string;
  scroll: boolean;
  color: string;
  bg: string;
}

// A text message for the display: scrolling (marquee template) or a still, auto-sized card.
export function messageProject(presetId: string, m: MessageOptions): Project {
  const preset = getPreset(presetId);
  const mono = preset.color === 'mono';
  if (m.scroll) {
    const t = TEMPLATES.find((x) => x.id === 'marquee')!;
    return templateProject(t, presetId, { text: m.text, color: m.color, bg: m.bg, size: '0.5' });
  }
  const w = preset.width, h = preset.height;
  const pad = preset.round ? Math.round(w * 0.16) : Math.max(2, Math.round(w * 0.04));
  const lines = (m.text || ' ').split('\n').map((l) => l.trim()).filter(Boolean);
  const c = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
  const font = (size: number) => `700 ${size}px ${fontCss('sans')}, ${EMOJI_FONT}`;
  // Largest size at which every line fits.
  let size = Math.floor((h - pad * 2) / Math.max(1, lines.length) / 1.25);
  for (; size > 6; size--) {
    c.font = font(size);
    if (lines.every((l) => c.measureText(l).width <= w - pad * 2) && lines.length * size * 1.25 <= h - pad * 2) break;
  }
  c.fillStyle = mono ? '#000' : m.bg;
  c.fillRect(0, 0, w, h);
  c.font = font(size);
  c.fillStyle = mono ? '#fff' : m.color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const lh = size * 1.25, top = h / 2 - (lh * (lines.length - 1)) / 2;
  lines.forEach((l, i) => c.fillText(l, w / 2, top + i * lh));
  const data = c.getImageData(0, 0, w, h).data;
  const p = createProject({ presetId, width: w, height: h, scale: 1, name: messageFile(), background: mono ? '#000000' : m.bg,
    frames: [newFrame(w, h, 1000, data)] });
  if (mono) p.adjust.dither = 'none';
  return p;
}
