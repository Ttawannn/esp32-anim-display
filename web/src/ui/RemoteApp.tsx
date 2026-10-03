// Phone-first remote: tap an animation to show it on the board, plus next/stop, brightness,
// auto-cycle (playlist) and a one-tap install of the eye mood set.

import { useEffect, useRef, useState } from 'preact/hooks';
import { device, deviceConnectionKey, presetForDevice, type AnimFile, type DeviceInfo, type PlaylistData } from '../device/api';
import { uploadDpaFile } from '../device/send';
import { refreshDevice } from '../device/session';
import { SerialLink } from '../device/serial';
import { thumbnail } from '../device/thumbs';
import { thumbnailRevision } from '../device/thumbnailCache';
import { store, toast, useEditor } from '../model/store';
import { defaultEyeOptions, installMoodSet } from '../templates/eyeProject';
import type { EyeStyle } from '../templates/eyes';
import { formatBytes, Icon } from './common';
import { UsbControls } from './UsbControls';

function Tile(props: { host: string; file: AnimFile; info: DeviceInfo; revision: number; active: boolean; onPlay: () => void }) {
  const src = useThumbnail(props.host, props.file, props.revision);
  const d = props.info.display;
  const mismatch = props.file.width !== d.width || props.file.height !== d.height;
  return (
    <button class={`tile${props.active ? ' active' : ''}`} onClick={props.onPlay}>
      <div class={`shot${d.shape === 'round' ? ' round' : ''}`} style={{ aspectRatio: `${props.file.width} / ${props.file.height}` }}>
        {src ? <img src={src} alt="" /> : <span class="hint">…</span>}
        {props.active && <span class="playing">กำลังแสดง</span>}
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

  const current = files?.find((f) => f.name === playingName) ?? null;

  return (
    <div class="remote">
      <header class="remote-bar">
        <div class="brand">
          <span class="logo"><i /><i /></span>
          <span>Display <b>Remote</b></span>
        </div>
        <div class="spacer" />
        <span class={`chip${info ? ' on' : ''}`}>
          <span class="dot" />{info ? (s.deviceTransport === 'usb' ? 'USB' : 'Wi-Fi') : 'ไม่ได้เชื่อม'}
        </span>
        <a class="btn ghost" href="#/editor" title="เปิด Editor"><Icon name="pencil" /></a>
      </header>
      {SerialLink.supported() && <UsbControls />}

      {!info ? (
        <section class="card">
          <h3>เชื่อมต่อบอร์ด</h3>
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
            <NowShot host={host} file={current} info={info} live={info.player.live} />
            <div class="grow">
              <div class="hint">กำลังแสดงบน {info.display.name}</div>
              <div class="title">{info.player.live ? 'ดูสดจาก Editor' : info.player.name || 'ยังไม่ได้เล่น'}</div>
              <div class="hint">{status}</div>
            </div>
          </section>
          <div class="now-controls">
            <button class="btn big grow" title="หยุด" onClick={() => act(() => device.stop(host))}>
              <Icon name="pause" fill /> หยุด
            </button>
            <button class="btn big primary grow" title="ถัดไป" onClick={() => act(() => device.next(host))}>
              หน้าถัดไป <Icon name="right" />
            </button>
          </div>

          <section class="card">
            <label class="field">
              <span>ความสว่าง</span>
              <input type="range" min={5} max={255} value={brightness ?? info.display.brightness}
                onInput={(e) => setBrightness(Number((e.target as HTMLInputElement).value))}
                onChange={(e) => act(() => device.brightness(host, Number((e.target as HTMLInputElement).value)))} />
              <span class="v">{Math.round(((brightness ?? info.display.brightness) / 255) * 100)}%</span>
            </label>
            <label class="toggle">
              <input type="checkbox" checked={!!playlist?.enabled} disabled={!playlist || !files?.length} onChange={toggleAuto} />
              <span class="track" />
              <span><b>เปลี่ยนหน้าอัตโนมัติ</b><small>วนเล่นทุกหน้า หน้าละ 8 วินาที</small></span>
            </label>
          </section>

          <section>
            <div class="row">
              <h3 class="grow">แตะเพื่อแสดงบนจอ {files ? `(${files.length})` : ''}</h3>
              <span class="hint">ว่าง {formatBytes(info.fs.free)}</span>
              <button class="btn small" onClick={async () => { if (await uploadDpaFile()) loadFiles(); }} title="ส่งไฟล์ .dpa จากเครื่องนี้">
                <Icon name="upload" /> .dpa
              </button>
            </div>
            {files === null ? (
              <p class="hint">กำลังโหลด...</p>
            ) : files.length === 0 ? (
              <div class="empty">
                <span class="emoji">🖼️</span>
                <b>ยังไม่มีแอนิเมชันบนบอร์ด</b>
                <span class="hint">ติดตั้งชุดอารมณ์ดวงตาด้านล่างได้ในแตะเดียว หรือสร้างเองใน Editor</span>
              </div>
            ) : (
              <div class="tiles">
                {files.map((f) => (
                  <Tile key={`${connection}:${f.name}`} host={host} file={f} info={info} revision={thumbnailRevision()} active={f.name === playingName} onPlay={() => play(f.name)} />
                ))}
              </div>
            )}
          </section>

          <section class="card moods">
            <div class="mood-row" aria-hidden="true">👀😄😢😠😲😴😍😉🤨😵</div>
            <h3>ชุดอารมณ์ดวงตา 12 แบบ</h3>
            <p class="hint">สร้างให้พอดีกับจอนี้แล้วติดตั้งลงบอร์ด (ไฟล์ชื่อเดิมจะถูกแทนที่)</p>
            <div class="seg" role="radiogroup">
              {([['robot', 'หุ่นยนต์'], ['cartoon', 'การ์ตูน'], ['single', 'ตาเดียว']] as [EyeStyle, string][]).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={style === id} class={style === id ? 'active' : ''}
                  disabled={!!install} onClick={() => setStyle(id)}>{label}</button>
              ))}
            </div>
            <button class="btn primary big wide" onClick={installSet} disabled={!!install}>
              {install ? `กำลังติดตั้ง ${install.done + 1}/${install.total}…` : <><Icon name="sparkle" /> ติดตั้งชุดอารมณ์</>}
            </button>
            {install && (
              <div class="progress"><div style={{ width: `${(install.done / install.total) * 100}%` }} /></div>
            )}
          </section>
        </>
      )}
      {s.toast && <div class={`toast${s.toast.error ? ' error' : ''}`} role="status">{s.toast.text}</div>}
    </div>
  );
}

function useThumbnail(host: string, file: AnimFile | null, revision: number) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(null);
    if (!file) return;
    let alive = true;
    const image = thumbnail(host, file);
    image.promise.then((url) => alive && setSrc(url));
    return () => { alive = false; image.release(); };
  }, [host, file, revision]);
  return src;
}

function NowShot(props: { host: string; file: AnimFile | null; info: DeviceInfo; live: boolean }) {
  const src = useThumbnail(props.host, props.live ? null : props.file, thumbnailRevision());
  return (
    <div class={`now-shot${props.info.display.shape === 'round' ? ' round' : ''}`}>
      {src ? <img src={src} alt="" /> : <Icon name={props.live ? 'live' : 'board'} />}
    </div>
  );
}
