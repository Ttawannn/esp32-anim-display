import { encodeProject } from '../codec/encode';
import { store, toast } from '../model/store';
import { device, deviceFileName } from './api';
import { refreshDevice } from './session';
import { pickFile } from '../ui/common';

// Encode the current project and upload it to the board, reporting progress in store.sending
// (encoding is the first 30% of the bar). If no board is connected, opens the connection popover.
export async function sendToBoard(): Promise<boolean> {
  if (store.state.sending) return false;
  if (!store.state.deviceInfo) {
    try {
      await refreshDevice();
    } catch {
      store.set({ connectOpen: true });
      toast('เชื่อมต่อบอร์ดก่อน (USB หรือ Wi-Fi) แล้วกดส่งอีกครั้ง', true);
      return false;
    }
  }
  const { project, deviceHost } = store.state;
  const name = deviceFileName(project.name);
  try {
    store.set({ sending: { label: 'กำลังเตรียมไฟล์', pct: 0 } });
    const r = await encodeProject(project, (done, total) =>
      store.set({ sending: { label: 'กำลังเตรียมไฟล์', pct: (done / total) * 0.3 } }));
    store.set({ sending: { label: 'กำลังส่ง', pct: 0.3 } });
    await device.upload(deviceHost, name, r.bytes, true, (sent, total) =>
      store.set({ sending: { label: 'กำลังส่ง', pct: 0.3 + (sent / total) * 0.7 } }));
    toast(`ส่ง "${name}" แล้ว บอร์ดกำลังเล่น`);
    refreshDevice().catch(() => {});
    return true;
  } catch (e) {
    toast((e as Error).message, true);
    return false;
  } finally {
    store.set({ sending: null });
  }
}

// Uploads a .dpa file from this computer/phone (e.g. one downloaded from the online editor).
export async function uploadDpaFile(): Promise<string | null> {
  const file = await pickFile('.dpa');
  if (!file) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 32 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'DPA1') {
    toast('ไฟล์นี้ไม่ใช่ .dpa ที่ถูกต้อง', true);
    return null;
  }
  const name = deviceFileName(file.name.replace(/\.dpa$/i, ''));
  try {
    store.set({ sending: { label: 'กำลังส่ง', pct: 0 } });
    await device.upload(store.state.deviceHost, name, bytes, true, (sent, total) =>
      store.set({ sending: { label: 'กำลังส่ง', pct: sent / total } }));
    toast(`ส่ง "${name}" แล้ว บอร์ดกำลังเล่น`);
    refreshDevice().catch(() => {});
    return name;
  } catch (e) {
    toast((e as Error).message, true);
    return null;
  } finally {
    store.set({ sending: null });
  }
}

// The hosted site (GitHub Pages) has the browser firmware installer under /flash/.
export const SITE_URL = 'https://ttawannn.github.io/esp32-anim-display/';
export function firmwareInstallerUrl(): string {
  return location.hostname.endsWith('github.io') ? new URL('flash/', location.href.split('#')[0]).href : SITE_URL + 'flash/';
}
