// Firmware version this editor was built with (firmware/src/app/app.h, injected by vite.config.ts).
// The editor served by a board always matches its firmware; the online editor can be newer.

declare const __FIRMWARE_VERSION__: string;
export const LATEST_FIRMWARE: string = typeof __FIRMWARE_VERSION__ === 'string' ? __FIRMWARE_VERSION__ : '0.0.0';

// Numeric compare of "major.minor.patch" (anything after '+' or '-' is ignored).
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split(/[+-]/)[0].split('.').map((x) => parseInt(x, 10) || 0);
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export function firmwareOutdated(boardVersion: string | undefined, latest = LATEST_FIRMWARE): boolean {
  return !!boardVersion && compareVersions(boardVersion, latest) < 0;
}
