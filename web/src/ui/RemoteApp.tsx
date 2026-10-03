// Phone-first remote: tap an animation to show it on the board, plus next/stop, brightness,
// auto-cycle (playlist) and a one-tap install of the eye mood set.

import { useEffect, useRef, useState } from 'preact/hooks';
import { device, deviceConnectionKey, presetForDevice, type AnimFile, type DeviceInfo, type PlaylistData } from '../device/api';
import { refreshDevice } from '../device/session';
import { thumbnail } from '../device/thumbs';
import { thumbnailRevision } from '../device/thumbnailCache';
import { store, toast, useEditor } from '../model/store';
import { defaultEyeOptions, installMoodSet } from '../templates/eyeProject';
import type { EyeStyle } from '../templates/eyes';
import { formatBytes, Icon } from './common';
import { UsbControls } from './UsbControls';

function Tile(props: { host: string; file: AnimFile; info: DeviceInfo; revision: number; active: boolean; onPlay: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const image = thumbnail(props.host, props.file);
    image.promise.then((url) => alive && setSrc(url));
    return () => { alive = false; image.release(); };
  }, [props.host, props.file, props.revision]);
  const d = props.info.display;
  const mismatch = props.file.width !== d.width || props.file.height !== d.height;
  return (
    <button class={`tile${props.active ? ' active' : ''}`} onClick={props.onPlay}>
      <div class={`shot${d.shape === 'round' ? ' round' : ''}`} style={{ aspectRatio: `${props.file.width} / ${props.file.height}` }}>
        {src ? <img src={src} alt="" /> : <span class="hint">…</span>}
        {props.active && <span class="playing">▶</span>}
      </div>
      <div class="label">{props.file.name}</div>
      {mismatch && <div class="warn small">ทำมาสำหรับจอคนละขนาด</div>}
    </button>
  );
}

export function RemoteApp() {
  const s = useEditor();
  const info = s.deviceInfo;
  const host = s.deviceHost;
  const connection = deviceConnectionKey(host);
  const [files, setFiles] = useState<AnimFile[] | null>(null);
  const [error, setError] = useState('');
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [brightness, setBrightness] = useState<number | null>(null);
  const [install, setInstall] = useState<{ done: number; total: number; name: string } | null>(null);
  const [style, setStyle] = useState<EyeStyle>('robot');
  const [pending, setPending] = useState<string | null>(null); // optimistic highlight
  const pollRef = useRef<number | undefined>(undefined);

  const loadFiles = () => device.list(host).then((r) => setFiles(r.anims), () => {});
  const connect = () =>
    refreshDevice().then(
      (i) => {
        setError('');
        setBrightness((b) => b ?? i.display.brightness);
        if (i.display.shape === 'round') setStyle((st) => (st === 'robot' ? 'single' : st));
        loadFiles();
        device.playlist(host).then(setPlaylist, () => {});
      },
      (e) => setError((e as Error).message),
    );

  useEffect(() => {
    setFiles(null);
    setPlaylist(null);
    setBrightness(null);
    setPending(null);
    connect();
    pollRef.current = window.setInterval(() => refreshDevice().catch(() => {}), 2000);
    return () => clearInterval(pollRef.current);
  }, [connection]);

  useEffect(() => {
    if (pending && info?.player.name === pending) setPending(null);
  }, [info?.player.name]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      refreshDevice().catch(() => {});
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const play = (name: string) => {
    setPending(name);
    act(() => device.play(host, name));
  };

  const toggleAuto = async () => {
    if (!playlist || !files) return;
    const enabled = !playlist.enabled;
    // Turning auto-cycle on with an empty playlist cycles through every file, 8 s each.
    const items = playlist.items.length ? playlist.items : files.map((f) => ({ name: f.name, seconds: 8 }));
    const next = { ...playlist, enabled, items };
    setPlaylist(next);
    await act(() => device.savePlaylist(host, next));
  };

  const installSet = async () => {
    if (!info) return;
    const presetId = presetForDevice(info) ?? 'st7789_240x240';
    const d = info.display;
    const o = { ...defaultEyeOptions(d.width, d.height, d.color === 'mono', d.shape === 'round'), style };
    try {
      const names = await installMoodSet(host, presetId, d, o, (done, total, name) => setInstall({ done, total, name }));
      await loadFiles();
      await device.play(host, names[0]);
      toast(`ติดตั้งชุดอารมณ์ ${names.length} แบบแล้ว`);
      refreshDevice().catch(() => {});
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setInstall(null);
    }
  };

  const playingName = pending ?? info?.player.name ?? '';
  const status = !info ? null
    : info.player.live ? 'กำลังแสดงสดจาก Editor'
    : info.player.name && info.player.playing ? `กำลังเล่น · ${info.player.fps.toFixed(0)} fps${info.player.playlist ? ' · เล่นวนอัตโนมัติ' : ''}`
    : 'หยุดอยู่';

  return (
    <div class="remote">
      <header class="remote-bar">
        <div class="brand">Display <span>Remote</span></div>
        <span class="dot" style={{ color: info ? 'var(--ok)' : 'var(--muted)' }}>●</span>
        <div class="spacer" />
        <a class="btn" href="#/editor">เปิด Editor</a>
      </header>
      <UsbControls />

      {!info ? (
        <section class="card">
          <p>{error || 'กำลังติดต่อบอร์ด...'}</p>
          <p class="hint">มือถือต้องเชื่อม Wi-Fi ของบอร์ด (DisplayEditor-XXXX รหัส displayedit) หรือ Wi-Fi เดียวกับบอร์ด</p>
          <div class="row">
            <input type="text" class="grow" placeholder="IP บอร์ด (ว่าง = บอร์ดที่เปิดหน้านี้)" value={host}
              onChange={(e) => { store.set({ deviceHost: (e.target as HTMLInputElement).value }); store.savePrefs(); }} />
            <button class="btn primary" onClick={connect}>เชื่อมต่อ</button>
          </div>
        </section>
      ) : (
        <>
          <section class="card now">
            <div class="grow">
              <div class="hint">{info.display.name}</div>
              <div class="title">{info.player.live ? 'ดูสด' : info.player.name || '—'}</div>
              <div class="hint">{status}</div>
            </div>
            <button class="btn big" title="หยุด" onClick={() => act(() => device.stop(host))}><Icon name="pause" fill /></button>
            <button class="btn big primary" title="ถัดไป" onClick={() => act(() => device.next(host))}><Icon name="right" /></button>
          </section>

          <section class="card">
            <label class="field">
              <span>ความสว่าง</span>
              <input type="range" min={5} max={255} value={brightness ?? info.display.brightness}
                onInput={(e) => setBrightness(Number((e.target as HTMLInputElement).value))}
                onChange={(e) => act(() => device.brightness(host, Number((e.target as HTMLInputElement).value)))} />
              <span class="v">{Math.round(((brightness ?? info.display.brightness) / 255) * 100)}%</span>
            </label>
            <label class="check switch">
              <input type="checkbox" checked={!!playlist?.enabled} disabled={!playlist || !files?.length} onChange={toggleAuto} />
              เปลี่ยนหน้าอัตโนมัติ (playlist)
            </label>
          </section>

          <section>
            <div class="row">
              <h3 class="grow">หน้าบนบอร์ด {files ? `(${files.length})` : ''}</h3>
              <span class="hint">ว่าง {formatBytes(info.fs.free)}</span>
            </div>
            {files === null ? (
              <p class="hint">กำลังโหลด...</p>
            ) : files.length === 0 ? (
              <p class="hint">ยังไม่มีแอนิเมชันบนบอร์ด ติดตั้งชุดอารมณ์ด้านล่าง หรือสร้างใน Editor</p>
            ) : (
              <div class="tiles">
                {files.map((f) => (
                  <Tile key={`${connection}:${f.name}`} host={host} file={f} info={info} revision={thumbnailRevision()} active={f.name === playingName} onPlay={() => play(f.name)} />
                ))}
              </div>
            )}
          </section>

          <section class="card">
            <h3>ชุดอารมณ์ดวงตา</h3>
            <p class="hint">สร้างดวงตา 12 อารมณ์ให้พอดีกับจอนี้ แล้วติดตั้งลงบอร์ด (ไฟล์ชื่อเดิมจะถูกแทนที่)</p>
            <div class="row">
              <select value={style} onChange={(e) => setStyle((e.target as HTMLSelectElement).value as EyeStyle)} disabled={!!install}>
                <option value="robot">หุ่นยนต์</option>
                <option value="cartoon">การ์ตูน</option>
                <option value="single">ตาเดียว</option>
              </select>
              <button class="btn primary grow" onClick={installSet} disabled={!!install}>
                {install ? `กำลังติดตั้ง ${install.done + 1}/${install.total}...` : 'ติดตั้งชุดอารมณ์'}
              </button>
            </div>
            {install && (
              <div class="progress"><div style={{ width: `${(install.done / install.total) * 100}%` }} /></div>
            )}
          </section>
        </>
      )}
      {s.toast && <div class={`toast${s.toast.error ? ' error' : ''}`}>{s.toast.text}</div>}
    </div>
  );
}
