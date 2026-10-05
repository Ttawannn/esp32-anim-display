import { encodeProject } from '../codec/encode';
import { device, deviceFileName } from '../device/api';
import { createProject, newFrame } from '../model/project';
import type { Project } from '../model/types';
import { EYE_ANIMS, generateEyes, type EyeOptions, type GeneratedEyes } from './eyes';
import { t } from '../i18n';

// Wraps generated eye frames in an editor project for the given display preset.
export function eyeProject(presetId: string, g: GeneratedEyes, o: EyeOptions, name: string): Project {
  const p = createProject({
    presetId, width: g.width, height: g.height, scale: g.scale, name, background: o.mono ? '#000000' : o.bgColor,
    frames: g.frames.map((f) => newFrame(g.width, g.height, f.delay, f.data)),
  });
  if (o.mono) p.adjust.dither = 'none';
  return p;
}

export function defaultEyeOptions(width: number, height: number, mono: boolean, round: boolean): EyeOptions {
  return {
    style: round ? 'single' : 'robot',
    eyeColor: '#2ee6ff',
    irisColor: '#3a8dde',
    bgColor: '#000000',
    size: 1,
    spacing: 1,
    fps: 20,
    pixel: 1,
    rotate: height > width * 1.5 ? 90 : 0,
    mono,
  };
}

// Generates every mood for the board's display and uploads each as "<emoji> <name>".
export async function installMoodSet(
  host: string,
  presetId: string,
  screen: { width: number; height: number },
  o: EyeOptions,
  onProgress: (done: number, total: number, name: string) => void,
): Promise<string[]> {
  const names: string[] = [];
  for (const [i, anim] of EYE_ANIMS.entries()) {
    const name = deviceFileName(`${anim.emoji} ${t(anim.name)}`);
    onProgress(i, EYE_ANIMS.length, t(anim.name));
    const g = generateEyes(screen.width, screen.height, anim, o);
    const { bytes } = await encodeProject(eyeProject(presetId, g, o, name));
    await device.upload(host, name, bytes, false);
    names.push(name);
  }
  onProgress(EYE_ANIMS.length, EYE_ANIMS.length, '');
  return names;
}
