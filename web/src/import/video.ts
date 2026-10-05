import { placeImage, type Placement } from './resample';
import type { Pixels } from '../model/types';
import { cancelled, checkFrameBudget } from './limits';
import { t } from '../i18n';

export interface VideoInfo {
  video: HTMLVideoElement;
  duration: number;
  width: number;
  height: number;
}

export function loadVideo(file: File): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = URL.createObjectURL(file);
    video.onloadeddata = () =>
      resolve({ video, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error(t("The browser can't open this video (try MP4 H.264 or WebM)")));
    };
  });
}

export function seek(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return resolve();
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener('seeked', ready);
      video.removeEventListener('error', failed);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error(t("Couldn't read a video frame")));
    const abort = () => finish(cancelled());
    const timer = setTimeout(() => finish(new Error(t('Reading a video frame took too long. Try another file.'))), 10000);
    video.addEventListener('seeked', ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    try { video.currentTime = time; } catch (error) { finish(error as Error); }
  });
}

export interface ExtractOptions {
  start: number;
  end: number;
  fps: number;
  width: number;
  height: number;
  placement: Placement;
}

export async function extractFrames(
  info: VideoInfo,
  opts: ExtractOptions,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ data: Pixels; delay: number }[]> {
  const step = 1 / opts.fps;
  const total = Math.max(1, Math.floor((opts.end - opts.start) * opts.fps));
  checkFrameBudget(opts.width, opts.height, total);
  const ctx = new OffscreenCanvas(opts.width, opts.height).getContext('2d', { willReadFrequently: true })!;
  const frames: { data: Pixels; delay: number }[] = [];
  const delay = Math.round(1000 / opts.fps);
  for (let i = 0; i < total; i++) {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
    await seek(info.video, Math.min(opts.start + i * step, info.duration - 0.001), signal);
    if (signal.aborted) throw cancelled();
    const data = placeImage(info.video, info.width, info.height, opts.width, opts.height, opts.placement, ctx);
    frames.push({ data: new Uint8ClampedArray(data), delay });
    onProgress(i + 1, total);
  }
  return frames;
}
