import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeProject } from '../codec/encode';
import { createProject } from '../model/project';
import { store } from '../model/store';
import { device, setUsbLink, type DeviceInfo } from './api';
import { SerialLink } from './serial';
import { refreshDevice, sendLiveFrame, setLive } from './session';

vi.mock('../codec/encode', async (original) => ({ ...await original<object>(), encodeProject: vi.fn() }));
const encoded = { bytes: Uint8Array.of(1), mode: 'indexed' as const, paletteSize: 1, exactColors: true, frameSizes: [1] };
afterEach(async () => {
  await setLive(false);
  vi.restoreAllMocks();
  vi.mocked(encodeProject).mockReset();
  setUsbLink(null);
});

it('keeps USB board status when an earlier Wi-Fi response arrives late', async () => {
  let finish!: (info: DeviceInfo) => void;
  const wifi = { board_name: 'wifi' } as DeviceInfo;
  const usb = { board_name: 'usb' } as DeviceInfo;
  vi.spyOn(device, 'liveEnd').mockResolvedValue();
  vi.spyOn(device, 'info').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValue(usb);
  const old = refreshDevice();
  const rejected = expect(old).rejects.toThrow('connection changed');
  const link = new SerialLink({ readable: null, writable: null });
  setUsbLink(link);
  await refreshDevice();
  finish(wifi);
  await rejected;
  expect(store.state.deviceInfo).toBe(usb);
  expect(store.state.deviceTransport).toBe('usb');
});

describe('live preview', () => {
  it('does not send a frame when preview was disabled during encoding', async () => {
    let finish!: (value: typeof encoded) => void;
    vi.mocked(encodeProject).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const live = vi.spyOn(device, 'live').mockResolvedValue();
    const end = vi.spyOn(device, 'liveEnd').mockResolvedValue();
    const sending = setLive(true);
    const stopping = setLive(false);
    finish(encoded);
    await Promise.all([sending, stopping]);
    expect(live).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledOnce();
  });

  it('ends preview after the last network request has finished', async () => {
    vi.mocked(encodeProject).mockResolvedValue(encoded);
    let finish!: () => void;
    const order: string[] = [];
    vi.spyOn(device, 'live').mockImplementation(() => new Promise((resolve) => {
      order.push('live'); finish = resolve;
    }));
    vi.spyOn(device, 'liveEnd').mockImplementation(async () => { order.push('end'); });
    const sending = setLive(true);
    await vi.waitFor(() => expect(order).toEqual(['live']));
    const stopping = setLive(false);
    expect(order).toEqual(['live']);
    finish();
    await Promise.all([sending, stopping]);
    expect(order).toEqual(['live', 'end']);
  });

  it('coalesces changes during sending and encodes the latest placement', async () => {
    const p = createProject({ presetId: 'st7789_240x240', width: 4, height: 4 });
    store.set({ project: p, frameIndex: 0 });
    vi.mocked(encodeProject).mockResolvedValue(encoded);
    let finish!: () => void;
    const live = vi.spyOn(device, 'live').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue();
    vi.spyOn(device, 'liveEnd').mockResolvedValue();
    const sending = setLive(true);
    await vi.waitFor(() => expect(live).toHaveBeenCalledOnce());
    store.set({ project: { ...p, scale: 2, offsetX: 11, offsetY: 12 } });
    const pending = sendLiveFrame();
    finish();
    await Promise.all([sending, pending]);
    expect(live).toHaveBeenCalledTimes(2);
    expect(vi.mocked(encodeProject).mock.calls.at(-1)![0]).toMatchObject({ scale: 2, offsetX: 11, offsetY: 12 });
  });
});
