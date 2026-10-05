export const MAX_FRAME_BYTES = 64 * 1024 * 1024;
export const MAX_FRAMES = 2000;
export const MAX_GIF_BYTES = 16 * 1024 * 1024;
export const cancelled = () => new DOMException('cancelled', 'AbortError');

export function checkFrameBudget(width: number, height: number, count: number): void {
  if (![width, height, count].every(Number.isSafeInteger) || width < 1 || height < 1 || count < 1 ||
      width > 4096 || height > 4096 || count > MAX_FRAMES || width * height * 4 * count > MAX_FRAME_BYTES)
    throw new Error('The images need too much memory. Lower the resolution, the number of frames or the clip length (max 64 MB / 2,000 frames).');
}
