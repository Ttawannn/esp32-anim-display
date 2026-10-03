import { useEffect, useState } from 'preact/hooks';
import {
  device, deviceConnectionKey, usbConnected, type AnimFile, type DevicePreset, type DisplaySettings, type PlaylistData, type WifiNetwork,
} from '../device/api';
import { connectUsb, refreshDevice } from '../device/session';
import { store, toast, useEditor } from '../model/store';
import { formatBytes, IconButton, Modal } from './common';
import { UsbControls } from './UsbControls';

type Tab = 'files' | 'playlist' | 'display' | 'wifi';

async function run(fn: () => Promise<unknown>, ok?: string) {
  try {
    await fn();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    toast((e as Error).message, true);
    return false;
  }
}

// After a reboot the board is gone for a few seconds; poll until it answers again.
async function waitForReboot() {
  const viaUsb = usbConnected();
  toast('กำลังรีบูตบอร์ด...');
  await new Promise((r) => setTimeout(r, 4000));
  for (let i = 0; i < 20; i++) {
    try {
      if (viaUsb && !usbConnected()) await connectUsb(true);
      await refreshDevice();
      toast('บอร์ดกลับมาแล้ว');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  toast('ยังติดต่อบอร์ดไม่ได้ — ถ้าเปลี่ยน Wi-Fi ให้เปิดหน้านี้ใหม่จาก IP ที่แสดงบนจอ', true);
}

export function DeviceDialog() {
  const s = useEditor();
  const host = s.deviceHost;
  const connection = deviceConnectionKey(host);
  const info = s.deviceInfo;
  const [tab, setTab] = useState<Tab>('files');
  const [error, setError] = useState('');
  const close = () => store.set({ dialog: null });

  useEffect(() => {
    refreshDevice().then(() => setError(''), (e) => setError((e as Error).message));
    const t = setInterval(() => refreshDevice().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [connection]);

  return (
    <Modal title="จัดการบอร์ด" onClose={close}>
      <div class="row">
        <input type="text" class="grow" placeholder="IP บอร์ด (ว่าง = บอร์ดที่เปิดหน้านี้)" value={host}
          onChange={(e) => { store.set({ deviceHost: (e.target as HTMLInputElement).value }); store.savePrefs(); }} />
        <button class="btn" onClick={() => refreshDevice().then(() => setError(''), (e) => setError((e as Error).message))}>
          เชื่อมต่อ
        </button>
      </div>
      <UsbControls />
      {!info ? (
        <p class="err">{error || 'กำลังติดต่อบอร์ด...'}</p>
      ) : (
        <>
          <p class="hint">
            {info.board_name} · เฟิร์มแวร์ {info.version} · จอ {info.display.name}
            {!info.display.ok && <span class="err"> (จอไม่ทำงาน: {info.display.error})</span>}
            {' '}· {info.wifi.mode === 'ap' ? `AP ${info.wifi.ssid}` : `Wi-Fi ${info.wifi.ssid}`} · {info.wifi.ip}
          </p>
          <div class="row" style={{ gap: 4 }}>
            {(['files', 'playlist', 'display', 'wifi'] as Tab[]).map((t) => (
              <button key={t} class={`btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {{ files: 'ไฟล์', playlist: 'Playlist', display: 'ตั้งค่าจอ', wifi: 'Wi-Fi' }[t]}
              </button>
            ))}
          </div>
          <div key={connection} style={{ marginTop: 12 }}>
            {tab === 'files' && <FilesTab host={host} />}
            {tab === 'playlist' && <PlaylistTab host={host} />}
            {tab === 'display' && <DisplayTab host={host} />}
            {tab === 'wifi' && <WifiTab host={host} />}
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------

function FilesTab({ host }: { host: string }) {
  const info = store.state.deviceInfo!;
  const [files, setFiles] = useState<AnimFile[] | null>(null);
  const load = () => device.list(host).then((r) => setFiles(r.anims), (e) => toast((e as Error).message, true));
  useEffect(() => { load(); }, [host]);
  const pl = info.player;
  const usedPct = (info.fs.used / info.fs.total) * 100;

  return (
    <>
      <div class="row">
        <span class="grow">
          {pl.live ? 'กำลังแสดงสดจาก Editor' : pl.name ? <>กำลังเล่น <b>{pl.name}</b> · {pl.fps.toFixed(1)} fps{pl.playlist && ' · playlist'}</> : 'ไม่ได้เล่นอะไร'}
        </span>
        <IconButton icon="pause" fill title="หยุด" onClick={() => run(() => device.stop(host))} />
        <IconButton icon="right" title="ถัดไป" onClick={() => run(() => device.next(host))} />
        <button class="btn" onClick={() => run(() => device.testPattern(host))} title="แสดงภาพทดสอบ 10 วินาที">ภาพทดสอบ</button>
      </div>
      <div class="stat"><span>พื้นที่</span><b>{formatBytes(info.fs.used)} / {formatBytes(info.fs.total)}</b></div>
      <div class="bar"><div style={{ width: `${usedPct}%` }} /></div>
      {files === null ? (
        <p class="hint">กำลังโหลด...</p>
      ) : files.length === 0 ? (
        <p class="hint">ยังไม่มีแอนิเมชันบนบอร์ด — กด "ส่งไปบอร์ด" ในแผงส่งออก</p>
      ) : (
        <table class="list">
          <tbody>
            {files.map((f) => {
              const mismatch = f.width !== info.display.width || f.height !== info.display.height;
              return (
                <tr key={f.name} class={f.name === pl.name ? 'sel' : ''}>
                  <td class="grow">
                    {f.name}
                    <small> {f.width}×{f.height} · {f.frames} เฟรม · {formatBytes(f.size)}</small>
                    {mismatch && <small class="warn"> · ทำมาสำหรับจอคนละขนาด</small>}
                  </td>
                  <td class="actions">
                    <IconButton icon="play" fill title="เล่น" onClick={() => run(() => device.play(host, f.name))} />
                    <IconButton icon="trash" title="ลบ" onClick={() => {
                      if (confirm(`ลบ "${f.name}" ออกจากบอร์ด?`)) run(() => device.remove(host, f.name), 'ลบแล้ว').then(load);
                    }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function PlaylistTab({ host }: { host: string }) {
  const [pl, setPl] = useState<PlaylistData | null>(null);
  const [files, setFiles] = useState<AnimFile[]>([]);
  const [add, setAdd] = useState('');
  useEffect(() => {
    device.playlist(host).then(setPl, (e) => toast((e as Error).message, true));
    device.list(host).then((r) => { setFiles(r.anims); setAdd(r.anims[0]?.name ?? ''); }, () => {});
  }, [host]);
  if (!pl) return <p class="hint">กำลังโหลด...</p>;

  const items = pl.items;
  const setItems = (next: PlaylistData['items']) => setPl({ ...pl, items: next });
  const move = (i: number, d: number) => {
    const next = items.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
  };

  return (
    <>
      <div class="row">
        <label class="check"><input type="checkbox" checked={pl.enabled} onChange={() => setPl({ ...pl, enabled: !pl.enabled })} />
          เปิดใช้ playlist (เล่นต่อกันอัตโนมัติ)</label>
        <label class="check"><input type="checkbox" checked={pl.shuffle} onChange={() => setPl({ ...pl, shuffle: !pl.shuffle })} />
          สุ่มลำดับ</label>
      </div>
      <table class="list">
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td class="grow">{it.name}{!files.some((f) => f.name === it.name) && <small class="warn"> · ไม่พบไฟล์</small>}</td>
              <td>
                <input type="number" min={0} max={3600} value={it.seconds} title="วินาที (0 = เล่นจบหนึ่งรอบ)"
                  onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, seconds: Number((e.target as HTMLInputElement).value) } : x)))} />
                <span class="hint"> วินาที</span>
              </td>
              <td class="actions">
                <IconButton icon="left" title="ขึ้น" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon="right" title="ลง" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon="trash" title="เอาออก" onClick={() => setItems(items.filter((_, k) => k !== i))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p class="hint">ยังไม่มีรายการ</p>}
      <div class="row">
        <select class="grow" value={add} onChange={(e) => setAdd((e.target as HTMLSelectElement).value)}>
          {files.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
        <button class="btn" disabled={!add} onClick={() => setItems([...items, { name: add, seconds: 0 }])}>เพิ่ม</button>
      </div>
      <p class="hint">0 วินาที = เล่นแอนิเมชันจบหนึ่งรอบแล้วไปรายการถัดไป · กดปุ่ม BOOT บนบอร์ดเพื่อข้ามได้</p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        <button class="btn primary" onClick={() => run(() => device.savePlaylist(host, pl), 'บันทึก playlist แล้ว')}>บันทึก</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

const ROTATIONS = ['0°', '90°', '180°', '270°'];

function DisplayTab({ host }: { host: string }) {
  const [d, setD] = useState<DisplaySettings | null>(null);
  const [presets, setPresets] = useState<DevicePreset[]>([]);
  useEffect(() => {
    device.display(host).then(setD, (e) => toast((e as Error).message, true));
    device.presets(host).then(setPresets, () => {});
  }, [host]);
  if (!d) return <p class="hint">กำลังโหลด...</p>;

  const preset = presets.find((p) => p.id === d.preset);
  const mono = preset?.color === 'mono';
  const set = (patch: Partial<DisplaySettings>) => setD({ ...d, ...patch });
  const num = (v: string) => Number(v);
  const save = async () => {
    if (await run(() => device.saveDisplay(host, d))) await waitForReboot();
  };

  return (
    <>
      <div class="row">
        <span class="hint">รุ่นจอ</span>
        <select class="grow" value={d.preset} onChange={(e) => set({ preset: (e.target as HTMLSelectElement).value })}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div class="row">
        <span class="hint">หมุน</span>
        <select value={d.rotation} onChange={(e) => set({ rotation: num((e.target as HTMLSelectElement).value) })}>
          {ROTATIONS.map((r, i) => (mono && i % 2 ? null : <option key={i} value={i}>{r}</option>))}
        </select>
        {!mono && (
          <>
            <span class="hint">offset</span>
            <input type="number" value={d.offset_x} onChange={(e) => set({ offset_x: num((e.target as HTMLInputElement).value) })} />
            <input type="number" value={d.offset_y} onChange={(e) => set({ offset_y: num((e.target as HTMLInputElement).value) })} />
          </>
        )}
      </div>
      <div class="row">
        <label class="check"><input type="checkbox" checked={d.invert} onChange={() => set({ invert: !d.invert })} /> กลับสี (invert)</label>
        {!mono && <label class="check"><input type="checkbox" checked={d.bgr} onChange={() => set({ bgr: !d.bgr })} /> สลับแดง/น้ำเงิน (BGR)</label>}
        {!mono && <label class="check"><input type="checkbox" checked={d.mirror_x} onChange={() => set({ mirror_x: !d.mirror_x })} /> กลับซ้าย-ขวา</label>}
      </div>
      <div class="row">
        {mono ? (
          <>
            <span class="hint">I2C</span>
            <select value={d.i2c_hz} onChange={(e) => set({ i2c_hz: num((e.target as HTMLSelectElement).value) })}>
              {[400000, 800000, 1000000].map((v) => <option key={v} value={v}>{v / 1000} kHz</option>)}
            </select>
            <span class="hint">address</span>
            <select value={d.i2c_addr} onChange={(e) => set({ i2c_addr: num((e.target as HTMLSelectElement).value) })}>
              <option value={0x3c}>0x3C</option>
              <option value={0x3d}>0x3D</option>
            </select>
          </>
        ) : (
          <>
            <span class="hint">ความเร็ว SPI</span>
            <select value={d.spi_hz} onChange={(e) => set({ spi_hz: num((e.target as HTMLSelectElement).value) })}>
              {[10, 20, 27, 40, 60, 80].map((m) => <option key={m} value={m * 1000000}>{m} MHz</option>)}
            </select>
            <span class="hint">mode</span>
            <select value={d.spi_mode} onChange={(e) => set({ spi_mode: num((e.target as HTMLSelectElement).value) })}>
              {[0, 1, 2, 3].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </>
        )}
      </div>
      <details>
        <summary class="hint" style={{ cursor: 'pointer' }}>ขาที่ต่อ (GPIO, -1 = ไม่ได้ต่อ)</summary>
        <div class="row">
          {(['clk', 'data', 'cs', 'dc', 'rst', 'bl'] as const).map((k) => (
            <label key={k} class="hint">{k.toUpperCase()}{' '}
              <input type="number" min={-1} max={48} value={d.pins[k]}
                onChange={(e) => set({ pins: { ...d.pins, [k]: num((e.target as HTMLInputElement).value) } })} />
            </label>
          ))}
        </div>
      </details>
      <label class="field">
        <span>ความสว่าง</span>
        <input type="range" min={0} max={255} value={d.brightness}
          onInput={(e) => set({ brightness: num((e.target as HTMLInputElement).value) })}
          onChange={(e) => run(() => device.brightness(host, num((e.target as HTMLInputElement).value)))} />
        <span class="v">{Math.round((d.brightness / 255) * 100)}%</span>
      </label>
      <p class="hint">
        ดูภาพทดสอบ: สี่เหลี่ยมแดงต้องอยู่มุมซ้ายบน (จอกลม: ด้านบน) · แดง/น้ำเงินสลับ → BGR · สีเหมือนฟิล์มเนกาทีฟ → invert ·
        ขอบหายหรือมีเส้นขยะ → offset · ภาพเพี้ยน → ลดความเร็ว
      </p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        <button class="btn" onClick={() => run(() => device.testPattern(host))}>ภาพทดสอบ</button>
        <button class="btn primary" onClick={save}>บันทึกและรีบูต</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function WifiTab({ host }: { host: string }) {
  const info = store.state.deviceInfo!;
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      for (let i = 0; i < 20; i++) {
        const r = await device.scan(host);
        if (!r.scanning) {
          setNetworks(r.networks ?? []);
          break;
        }
        await new Promise((res) => setTimeout(res, 1000));
      }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!confirm(`ให้บอร์ดเชื่อม Wi-Fi "${ssid}" แล้วรีบูต?\nหลังจากนั้นเปิด http://display.local หรือดู IP บนจอ (กดปุ่ม BOOT ค้าง 2 วินาที)`)) return;
    if (await run(() => device.saveWifi(host, ssid, password))) await waitForReboot();
  };

  return (
    <>
      <p>
        ตอนนี้: {info.wifi.mode === 'ap'
          ? <>บอร์ดปล่อย Wi-Fi เอง <b>{info.wifi.ssid}</b> (รหัส displayedit)</>
          : <>เชื่อม <b>{info.wifi.ssid}</b> · สัญญาณ {info.wifi.rssi} dBm</>} · {info.wifi.ip} · {info.wifi.hostname}
      </p>
      <div class="row">
        <button class="btn" onClick={scan} disabled={scanning}>{scanning ? 'กำลังค้นหา...' : 'ค้นหา Wi-Fi'}</button>
      </div>
      {networks && (
        <div class="swatches" style={{ gridTemplateColumns: '1fr', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
          {networks.map((n) => (
            <button key={n.ssid} class={`card${n.ssid === ssid ? ' sel' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setSsid(n.ssid)}>
              {n.ssid} <small style={{ display: 'inline' }}>{n.rssi} dBm{n.secure ? ' · 🔒' : ''}</small>
            </button>
          ))}
          {networks.length === 0 && <p class="hint">ไม่พบเครือข่าย</p>}
        </div>
      )}
      <div class="row">
        <input type="text" class="grow" placeholder="ชื่อ Wi-Fi (SSID)" value={ssid} onInput={(e) => setSsid((e.target as HTMLInputElement).value)} />
        <input type="text" class="grow" placeholder="รหัสผ่าน" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
      </div>
      <p class="hint">ถ้าเชื่อมไม่ได้ภายใน 15 วินาที บอร์ดจะกลับมาปล่อย Wi-Fi ของตัวเองให้ตั้งค่าใหม่</p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        {info.wifi.mode === 'sta' && (
          <button class="btn" onClick={async () => {
            if (confirm('ลืม Wi-Fi นี้และกลับไปปล่อย Wi-Fi ของบอร์ดเอง?') && (await run(() => device.forgetWifi(host)))) await waitForReboot();
          }}>ลืม Wi-Fi</button>
        )}
        <button class="btn primary" disabled={!ssid} onClick={save}>เชื่อมต่อและรีบูต</button>
      </div>
    </>
  );
}
