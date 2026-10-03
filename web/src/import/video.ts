import { placeImage, type Placement } from './resample';
import type { Pixels } from '../model/types';

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
    video.onerror = () => reject(new Error('เบราว์เซอร์เปิดไฟล์วิดีโอนี้ไม่ได้ (ลอง MP4 H.264 หรือ WebM)'));
  });
}

export function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 0.001 && video.readyState >= 2) return resolve();
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = t;
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
  const ctx = new OffscreenCanvas(opts.width, opts.height).getContext('2d', { willReadFrequently: true })!;
  const frames: { data: Pixels; delay: number }[] = [];
  const delay = Math.round(1000 / opts.fps);
  for (let i = 0; i < total; i++) {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
    await seek(info.video, Math.min(opts.start + i * step, info.duration - 0.001));
    const data = placeImage(info.video, info.width, info.height, opts.width, opts.height, opts.placement, ctx);
    frames.push({ data: new Uint8ClampedArray(data), delay });
    onProgress(i + 1, total);
  }
  return frames;
}
