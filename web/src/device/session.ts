import { encodeProject } from '../codec/encode';
import { store, toast } from '../model/store';
import { retarget } from '../model/project';
import { getPreset } from '../model/presets';
import { device, deviceConnectionKey, isServedByBoard, presetForDevice, setUsbLink, usbConnected, type DeviceInfo } from './api';
import { SerialLink } from './serial';

let usb: SerialLink | null = null;
let connecting: Promise<DeviceInfo> | null = null;

export function connectUsb(reuseGranted = false): Promise<DeviceInfo> {
  if (usbConnected()) return refreshDevice();
  if (connecting) return connecting;
  const connect = async () => {
    const link = await SerialLink.connect(reuseGranted);
    usb = link;
    setUsbLink(link);
    link.onClose = () => {
      if (usb !== link) return;
      usb = null;
      setUsbLink(null);
      generation++;
      liveAbort?.abort();
      store.set({ deviceInfo: null, deviceTransport: null, live: false });
      toast('สาย USB หลุด — เชื่อมต่อใหม่เพื่อใช้งานต่อ', true);
    };
    try {
      const info = await refreshDevice();
      matchDisplay(info);
      return info;
    } catch (error) {
      link.onClose = null;
      if (usb === link) { usb = null; setUsbLink(null); }
      await link.close();
      throw error;
    }
  };
  connecting = connect().finally(() => { connecting = null; });
  return connecting;
}

export async function disconnectUsb() {
  const link = usb;
  if (store.state.live || liveTask) await setLive(false);
  if (usb === link) { usb = null; setUsbLink(null); }
  if (link) { link.onClose = null; await link.close(); }
  store.set({ deviceInfo: null, deviceTransport: null });
}

export async function refreshDevice(): Promise<DeviceInfo> {
  const host = store.state.deviceHost;
  const connection = deviceConnectionKey(host);
  const current = () => connection === deviceConnectionKey(store.state.deviceHost);
  try {
    const info = await device.info(host);
    if (!current()) throw new Error('การเชื่อมต่อบอร์ดเปลี่ยนแล้ว');
    store.set({ deviceInfo: info, deviceTransport: usbConnected() ? 'usb' : 'wifi' });
    syncClock(host, connection, info);
    return info;
  } catch (e) {
    if (current()) {
      generation++;
      liveAbort?.abort();
      store.set({ deviceInfo: null, deviceTransport: usbConnected() ? 'usb' : null, live: false });
    }
    throw e;
  }
}

// The board has no battery-backed clock: give it ours whenever it is unset or drifting.
let clockSynced = { connection: '', at: 0 };
function syncClock(host: string, connection: string, info: DeviceInfo) {
  if (info.time === undefined) return; // firmware without clock support
  const drift = Math.abs(info.time - Date.now() / 1000);
  const recent = clockSynced.connection === connection && Date.now() - clockSynced.at < 60000;
  if (drift < 3 || recent) return;
  clockSynced = { connection, at: Date.now() };
  device.setTime(host).catch(() => { clockSynced.at = 0; });
}

// When the editor is opened from the board, connect automatically and match its display.
export async function autoConnect() {
  if (!isServedByBoard() && !store.state.deviceHost && !import.meta.env.VITE_DEVICE_PROXY) return;
  try {
    const info = await refreshDevice();
    matchDisplay(info);
  } catch {
    /* board not reachable: stay offline */
  }
}

function matchDisplay(info: DeviceInfo) {
  const presetId = presetForDevice(info);
  const p = store.state.project;
  if (!presetId || presetId === p.presetId) return;
  const blank = p.frames.length === 1 && !p.frames[0].data.some((v, i) => i % 4 === 3 && v !== 0);
  if (blank) store.load(retarget(p, presetId));
  else toast(`บอร์ดใช้จอ ${getPreset(presetId).name} — เปลี่ยนได้ที่ "จำลองจอ"`);
}

// Live preview: sends the current frame as a single-frame .dpa. Only one request is in flight;
// edits made meanwhile are coalesced into the next send.
let liveTask: Promise<void> | null = null;
let liveAbort: AbortController | null = null;
let pending = false;
let generation = 0;

export async function sendLiveFrame() {
  if (!store.state.live) return;
  if (liveTask) {
    pending = true;
    return liveTask;
  }
  const g = generation;
  const controller = new AbortController();
  liveAbort = controller;
  const task = (async () => {
    try {
      do {
        pending = false;
        const { project: p, frameIndex, deviceHost } = store.state;
        const { bytes } = await encodeProject({ ...p, frames: [p.frames[frameIndex]], loop: 0 }, undefined, controller.signal);
        if (!store.state.live || generation !== g) break;
        await device.live(deviceHost, bytes);
      } while (pending && store.state.live && generation === g);
    } catch (e) {
      if (generation === g && store.state.live) {
        store.set({ live: false });
        toast((e as Error).message, true);
      }
    }
  })();
  liveTask = task;
  try { await task; }
  finally {
    if (liveTask === task) liveTask = null;
    if (liveAbort === controller) liveAbort = null;
    if (pending && store.state.live) queueMicrotask(sendLiveFrame);
  }
}

export async function setLive(on: boolean) {
  const g = ++generation;
  liveAbort?.abort();
  store.set({ live: on });
  if (on) {
    await sendLiveFrame();
  } else {
    pending = false;
    await liveTask;
    if (g === generation && !store.state.live) await device.liveEnd(store.state.deviceHost).catch(() => {});
  }
}
