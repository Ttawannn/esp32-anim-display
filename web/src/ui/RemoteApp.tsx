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
import { FirmwareNotice } from './FirmwareNotice';
import { LangSwitch } from './LangSwitch';
import { BoardSettingsSheet, MessageCard, TemplatesSection } from './RemoteExtras';
import { SetupWizardAuto } from './SetupWizard';
import { UsbControls } from './UsbControls';
import { t } from '../i18n';

// Auto-cycle time per page; 0 = play each animation once, then move on.
const CYCLE_CHOICES: [number, string][] = [[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [0, 'Once']];
const DEFAULT_CYCLE = 10;
const cycleLabel = (sec: number) => (sec ? t('{time} per page', { time: t(CYCLE_CHOICES.find(([v]) => v === sec)?.[1] ?? `${sec} s`) }) : t('Each plays once, then the next'));

function Tile(props: {
  host: string; file: AnimFile; info: DeviceInfo; revision: number; active: boolean; onPlay: () => void;
  manage?: { onRename: () => void; onDelete: () => void };
}) {
  const src = useThumbnail(props.host, props.file, props.revision);
  const d = props.info.display;
  const mismatch = props.file.width !== d.width || props.file.height !== d.height;
  if (props.manage) {
    return (
      <div class={`tile managing${props.active ? ' active' : ''}`}>
        <div class={`shot${d.shape === 'round' ? ' round' : ''}`} style={{ aspectRatio: `${props.file.width} / ${props.file.height}` }}>
          {src ? <img src={src} alt="" /> : <span class="hint">…</span>}
        </div>
        <div class="label">{props.file.name}</div>
        <div class="tile-actions">
          <button class="btn small" onClick={props.manage.onRename}><Icon name="pencil" /> {t('Rename')}</button>
          <button class="btn small danger" onClick={props.manage.onDelete}><Icon name="trash" /> {t('Delete')}</button>
        </div>
      </div>
    );
  }
  return (
    <button class={`tile${props.active ? ' active' : ''}`} onClick={props.onPlay}>
      <div class={`shot${d.shape === 'round' ? ' round' : ''}`} style={{ aspectRatio: `${props.file.width} / ${props.file.height}` }}>
        {src ? <img src={src} alt="" /> : <span class="hint">…</span>}
        {props.active && <span class="playing">{t('Playing')}</span>}
      </div>
      <div class="label">{props.file.name}</div>
      {mismatch && <div class="warn small">{t('Made for a different screen size')}</div>}
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
  const [manage, setManage] = useState(false);
  const [settings, setSettings] = useState(false);
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

  const renameFile = async (name: string) => {
    const to = prompt(t('New name'), name)?.trim();
    if (!to || to === name) return;
    await act(() => device.rename(host, name, to));
    loadFiles();
  };
  const deleteFile = async (name: string) => {
    if (!confirm(t('Delete "{name}" from the board?', { name }))) return;
    await act(() => device.remove(host, name));
    loadFiles();
  };

  const play = (name: string) => {
    setPending(name);
    act(() => device.play(host, name));
  };

  // One shared time when every item uses the same one; null = mixed (set in the board manager).
  const cycleSeconds = !playlist?.items.length ? DEFAULT_CYCLE
    : playlist.items.every((it) => it.seconds === playlist.items[0].seconds) ? playlist.items[0].seconds : null;

  const savePlaylist = async (next: PlaylistData) => {
    const before = playlist;
    setPlaylist(next);
    try {
      await device.savePlaylist(host, next);
      refreshDevice().catch(() => {});
    } catch (e) {
      setPlaylist(before);
      toast((e as Error).message, true);
    }
  };

  const toggleAuto = () => {
    if (!playlist || !files) return;
    // Turning auto-cycle on with an empty playlist cycles through every file.
    const items = playlist.items.length ? playlist.items : files.map((f) => ({ name: f.name, seconds: DEFAULT_CYCLE }));
    savePlaylist({ ...playlist, enabled: !playlist.enabled, items });
  };

  const setCycle = (seconds: number) => {
    if (!playlist || !files) return;
    const base = playlist.items.length ? playlist.items : files.map((f) => ({ name: f.name, seconds }));
    savePlaylist({ ...playlist, items: base.map((it) => ({ ...it, seconds })) });
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
      toast(t('Installed {n} eye moods', { n: names.length }));
      refreshDevice().catch(() => {});
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setInstall(null);
    }
  };

  const playingName = pending ?? info?.player.name ?? '';
  const status = !info ? null
    : info.player.live ? t('Live from the editor')
    : info.player.name && info.player.playing ? `${t('Playing')} · ${info.player.fps.toFixed(0)} fps${info.player.playlist ? ` · ${t('auto-cycling')}` : ''}`
    : t('Stopped');

  const current = files?.find((f) => f.name === playingName) ?? null;

  return (
    <div class="remote">
      <header class="remote-bar">
        <div class="brand">
          <span class="logo"><i /><i /></span>
          <span>{info?.name ? <b class="board-name">{info.name}</b> : <>Display <b>Remote</b></>}</span>
        </div>
        <div class="spacer" />
        <span class={`chip${info ? ' on' : ''}`}>
          <span class="dot" />{info ? (s.deviceTransport === 'usb' ? 'USB' : 'Wi-Fi') : t('Not connected')}
        </span>
        <LangSwitch />
        {info && <button class="btn ghost" title={t('Board settings')} onClick={() => setSettings(true)}><Icon name="sliders" /></button>}
        <a class="btn ghost" href="#/editor" title={t('Open the editor')}><Icon name="pencil" /></a>
      </header>
      <SetupWizardAuto />
      {settings && info && <BoardSettingsSheet host={host} info={info} onClose={() => setSettings(false)} />}
      {SerialLink.supported() && <UsbControls />}

      <FirmwareNotice info={info} />
      {!info ? (
        <section class="card">
          <h3>{t('Connect to a board')}</h3>
          <p>{error || t('Contacting the board…')}</p>
          <p class="hint">{t("Your phone must be on the board's Wi-Fi (DisplayEditor-XXXX, password displayedit) or the same Wi-Fi as the board.")}</p>
          <div class="row">
            <input type="text" class="grow" placeholder={t('Board IP (empty = the board serving this page)')} value={host}
              onChange={(e) => { store.set({ deviceHost: (e.target as HTMLInputElement).value }); store.savePrefs(); }} />
            <button class="btn primary" onClick={connect}>{t('Connect')}</button>
          </div>
        </section>
      ) : (
        <>
          <section class="card now">
            <NowShot host={host} file={current} info={info} live={info.player.live} />
            <div class="grow">
              <div class="hint">{t('Showing on {display}', { display: info.display.name })}</div>
              <div class="title">{info.player.live ? t('Live from the editor') : info.player.name || t('Nothing playing yet')}</div>
              <div class="hint">{status}</div>
            </div>
          </section>
          <div class="now-controls">
            <button class="btn big grow" title={t('Stop')} onClick={() => act(() => device.stop(host))}>
              <Icon name="pause" fill /> {t('Stop')}
            </button>
            <button class="btn big primary grow" title={t('Next')} onClick={() => act(() => device.next(host))}>
              {t('Next page')} <Icon name="right" />
            </button>
          </div>

          <section class="card">
            <label class="field">
              <span>{t('Brightness')}</span>
              <input type="range" min={5} max={255} value={brightness ?? info.display.brightness}
                onInput={(e) => setBrightness(Number((e.target as HTMLInputElement).value))}
                onChange={(e) => act(() => device.brightness(host, Number((e.target as HTMLInputElement).value)))} />
              <span class="v">{Math.round(((brightness ?? info.display.brightness) / 255) * 100)}%</span>
            </label>
            <label class="toggle">
              <input type="checkbox" checked={!!playlist?.enabled} disabled={!playlist || !files?.length} onChange={toggleAuto} />
              <span class="track" />
              <span><b>{t('Auto-cycle pages')}</b>
                <small>{playlist?.shuffle ? `${t('shuffled')} · ` : ''}{cycleSeconds === null ? t('Each page has its own time') : cycleLabel(cycleSeconds)}</small></span>
            </label>
            {playlist?.enabled && (
              <div class="seg cycle" role="radiogroup" aria-label={t('Time per page')}>
                {CYCLE_CHOICES.map(([sec, label]) => (
                  <button key={sec} role="radio" aria-checked={cycleSeconds === sec} class={cycleSeconds === sec ? 'active' : ''}
                    onClick={() => setCycle(sec)}>{t(label)}</button>
                ))}
              </div>
            )}
            <p class="hint boot-hint">{t('BOOT button on the board: press = next page · hold 2 s = show the IP on screen')}</p>
          </section>

          <section>
            <div class="row">
              <h3 class="grow">{manage ? t('Manage files') : t('Tap to show on screen')} {files ? `(${files.length})` : ''}</h3>
              <span class="hint">{t('{size} free', { size: formatBytes(info.fs.free) })}</span>
              {!!files?.length && (
                <button class={`btn small${manage ? ' active' : ''}`} onClick={() => setManage(!manage)}>
                  {manage ? t('Done') : <><Icon name="pencil" /> {t('Manage')}</>}
                </button>
              )}
              <button class="btn small" onClick={async () => { if (await uploadDpaFile()) loadFiles(); }} title={t('Send a .dpa file from this device')}>
                <Icon name="upload" /> .dpa
              </button>
            </div>
            {files === null ? (
              <p class="hint">{t('Loading…')}</p>
            ) : files.length === 0 ? (
              <div class="empty">
                <span class="emoji">🖼️</span>
                <b>{t('No animations on the board yet')}</b>
                <span class="hint">{t('Install the eye moods below with one tap, or make your own in the editor')}</span>
              </div>
            ) : (
              <div class="tiles">
                {files.map((f) => (
                  <Tile key={`${connection}:${f.name}`} host={host} file={f} info={info} revision={thumbnailRevision()} active={f.name === playingName}
                    onPlay={() => play(f.name)} manage={manage ? { onRename: () => renameFile(f.name), onDelete: () => deleteFile(f.name) } : undefined} />
                ))}
              </div>
            )}
          </section>

          <MessageCard host={host} info={info} onSent={() => { loadFiles(); refreshDevice().catch(() => {}); }} />
          <TemplatesSection host={host} info={info} onInstalled={() => { loadFiles(); refreshDevice().catch(() => {}); }} />

          <section class="card moods">
            <div class="mood-row" aria-hidden="true">👀😄😢😠😲😴😍😉🤨😵</div>
            <h3>{t('12 eye moods')}</h3>
            <p class="hint">{t('Made to fit this screen and installed on the board (files with the same name are replaced)')}</p>
            <div class="seg" role="radiogroup">
              {([['robot', 'Robot'], ['cartoon', 'Cartoon'], ['single', 'Single eye']] as [EyeStyle, string][]).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={style === id} class={style === id ? 'active' : ''}
                  disabled={!!install} onClick={() => setStyle(id)}>{t(label)}</button>
              ))}
            </div>
            <button class="btn primary big wide" onClick={installSet} disabled={!!install}>
              {install ? t('Installing {n}/{total}…', { n: install.done + 1, total: install.total }) : <><Icon name="sparkle" /> {t('Install the eye moods')}</>}
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
