import { encodeDpa } from '../codec/dpa';
import { store, toast } from '../model/store';
import { retarget } from '../model/project';
import { getPreset } from '../model/presets';
import { device, isServedByBoard, presetForDevice, type DeviceInfo } from './api';

export async function refreshDevice(): Promise<DeviceInfo> {
  try {
    const info = await device.info(store.state.deviceHost);
    store.set({ deviceInfo: info });
    return info;
  } catch (e) {
    store.set({ deviceInfo: null, live: false });
    throw e;
  }
}

// When the editor is opened from the board, connect automatically and match its display.
export async function autoConnect() {
  if (!isServedByBoard() && !store.state.deviceHost && !import.meta.env.VITE_DEVICE_PROXY) return;
  try {
    const info = await refreshDevice();
    const presetId = presetForDevice(info);
    const p = store.state.project;
    if (!presetId || presetId === p.presetId) return;
    const blank = p.frames.length === 1 && !p.frames[0].data.some((v, i) => i % 4 === 3 && v !== 0);
    if (blank) {
      store.load(retarget(p, presetId));
    } else {
      toast(`บอร์ดใช้จอ ${getPreset(presetId).name} — เปลี่ยนได้ที่ "จำลองจอ"`);
    }
  } catch {
    /* board not reachable: stay offline */
  }
}

// Live preview: sends the current frame as a single-frame .dpa. Only one request is in flight;
// edits made meanwhile are coalesced into the next send.
let inFlight = false;
let pending = false;

export async function sendLiveFrame() {
  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;
  try {
    do {
      pending = false;
      const { project: p, frameIndex, deviceHost } = store.state;
      const { bytes } = await encodeDpa({ ...p, frames: [p.frames[frameIndex]], loop: 0 });
      await device.live(deviceHost, bytes);
    } while (pending && store.state.live);
  } catch (e) {
    store.set({ live: false });
    toast((e as Error).message, true);
  } finally {
    inFlight = false;
  }
}

export async function setLive(on: boolean) {
  store.set({ live: on });
  if (on) {
    await sendLiveFrame();
  } else {
    device.liveEnd(store.state.deviceHost).catch(() => {});
  }
}
