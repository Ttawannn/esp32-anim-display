import { useEffect, useState } from 'preact/hooks';
import { device, deviceConnectionKey, type AnimFile, type PlaylistData } from '../device/api';
import { uploadDpaFile } from '../device/send';
import { refreshDevice } from '../device/session';
import { store, toast, useEditor } from '../model/store';
import { BoardName, DisplayTab, run, WifiTab } from './BoardSettings';
import { formatBytes, Icon, IconButton, Modal } from './common';
import { FirmwareNotice } from './FirmwareNotice';
import { UsbControls } from './UsbControls';
import { t } from '../i18n';

type Tab = 'files' | 'playlist' | 'display' | 'wifi';

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
    <Modal title={t('Board manager')} onClose={close}>
      <div class="row">
        <input type="text" class="grow" placeholder={t('Board IP (empty = the board serving this page)')} value={host}
          onChange={(e) => { store.set({ deviceHost: (e.target as HTMLInputElement).value }); store.savePrefs(); }} />
        <button class="btn" onClick={() => refreshDevice().then(() => setError(''), (e) => setError((e as Error).message))}>
          {t('Connect')}
        </button>
      </div>
      <UsbControls />
      {!info ? (
        <p class="err">{error || t('Contacting the board…')}</p>
      ) : (
        <>
          <BoardName host={host} />
          <FirmwareNotice info={info} />
          <p class="hint">
            {info.board_name} · {t('firmware')} {info.version} · {t('display')} {info.display.name}
            {!info.display.ok && <span class="err"> ({t('display not working')}: {info.display.error})</span>}
            {' '}· {info.wifi.mode === 'ap' ? `AP ${info.wifi.ssid}` : `Wi-Fi ${info.wifi.ssid}`} · {info.wifi.ip}
          </p>
          <div class="row" style={{ gap: 4 }}>
            {(['files', 'playlist', 'display', 'wifi'] as Tab[]).map((id) => (
              <button key={id} class={`btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
                {t({ files: 'Files', playlist: 'Playlist', display: 'Display settings', wifi: 'Wi-Fi' }[id])}
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
          {pl.live ? t('Live from the editor') : pl.name ? <>{t('Playing')} <b>{pl.name}</b> · {pl.fps.toFixed(1)} fps{pl.playlist && ' · playlist'}</> : t('Nothing playing')}
        </span>
        <IconButton icon="pause" fill title={t('Stop')} onClick={() => run(() => device.stop(host))} />
        <IconButton icon="right" title={t('Next')} onClick={() => run(() => device.next(host))} />
        <button class="btn" onClick={() => run(() => device.testPattern(host))} title={t('Show the test pattern for 10 seconds')}>{t('Test pattern')}</button>
        <button class="btn" onClick={async () => { if (await uploadDpaFile()) load(); }} title={t('Send a .dpa file from this computer to the board')}>
          <Icon name="upload" /> {t('Upload .dpa')}
        </button>
      </div>
      <div class="stat"><span>{t('Storage')}</span><b>{formatBytes(info.fs.used)} / {formatBytes(info.fs.total)}</b></div>
      <div class="bar"><div style={{ width: `${usedPct}%` }} /></div>
      {files === null ? (
        <p class="hint">{t('Loading…')}</p>
      ) : files.length === 0 ? (
        <p class="hint">{t('No animations on the board yet. Press "Send to board" to add one.')}</p>
      ) : (
        <table class="list">
          <tbody>
            {files.map((f) => {
              const mismatch = f.width !== info.display.width || f.height !== info.display.height;
              return (
                <tr key={f.name} class={f.name === pl.name ? 'sel' : ''}>
                  <td class="grow">
                    {f.name}
                    <small> {f.width}×{f.height} · {t('{n} frames', { n: f.frames })} · {formatBytes(f.size)}</small>
                    {mismatch && <small class="warn"> · {t('Made for a different screen size')}</small>}
                  </td>
                  <td class="actions">
                    <IconButton icon="play" fill title={t('Play')} onClick={() => run(() => device.play(host, f.name))} />
                    <IconButton icon="trash" title={t('Delete')} onClick={() => {
                      if (confirm(t('Delete "{name}" from the board?', { name: f.name }))) run(() => device.remove(host, f.name), t('Deleted')).then(load);
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
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  useEffect(() => {
    device.playlist(host).then(setPl, (e) => toast((e as Error).message, true));
    device.list(host).then((r) => { setFiles(r.anims); setAdd(r.anims[0]?.name ?? ''); }, () => {});
  }, [host]);
  if (!pl) return <p class="hint">{t('Loading…')}</p>;

  const items = pl.items;
  const setItems = (next: PlaylistData['items']) => setPl({ ...pl, items: next });
  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    const next = items.slice();
    const [it] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, it);
    setItems(next);
  };
  const missing = files.filter((f) => !items.some((it) => it.name === f.name));

  return (
    <>
      <div class="row">
        <label class="check"><input type="checkbox" checked={pl.enabled} onChange={() => setPl({ ...pl, enabled: !pl.enabled })} />
          {t('Enable the playlist (plays one after another)')}</label>
        <label class="check"><input type="checkbox" checked={pl.shuffle} onChange={() => setPl({ ...pl, shuffle: !pl.shuffle })} />
          {t('Shuffle')}</label>
      </div>
      <table class="list">
        <tbody>
          {items.map((it, i) => (
            <tr key={i} draggable class={`${drag === i ? 'dragging' : ''}${over === i && drag !== null && drag !== i && drag !== i - 1 ? ' drop' : ''}`}
              onDragStart={(e) => { setDrag(i); e.dataTransfer?.setData('text/plain', String(i)); }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDrop={(e) => { e.preventDefault(); if (drag !== null) moveTo(drag, i); setDrag(null); setOver(null); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}>
              <td class="grip" title={t('Drag to reorder')}><Icon name="grip" /></td>
              <td class="grow">{it.name}{!files.some((f) => f.name === it.name) && <small class="warn"> · {t('file not found')}</small>}</td>
              <td>
                <input type="number" min={0} max={3600} value={it.seconds} title={t('Seconds (0 = play once)')}
                  onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, seconds: Number((e.target as HTMLInputElement).value) } : x)))} />
                <span class="hint"> {t('s')}</span>
              </td>
              <td class="actions">
                <IconButton icon="up" title={t('Up')} disabled={i === 0} onClick={() => moveTo(i, i - 1)} />
                <IconButton icon="down" title={t('Down')} disabled={i === items.length - 1} onClick={() => moveTo(i, i + 2)} />
                <IconButton icon="trash" title={t('Remove')} onClick={() => setItems(items.filter((_, k) => k !== i))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p class="hint">{t('No items yet')}</p>}
      <div class="row">
        <select class="grow" value={add} onChange={(e) => setAdd((e.target as HTMLSelectElement).value)}>
          {files.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
        <button class="btn" disabled={!add} onClick={() => setItems([...items, { name: add, seconds: 0 }])}>{t('Add')}</button>
        <button class="btn" disabled={!missing.length} title={t('Add every file not in the list yet')}
          onClick={() => setItems([...items, ...missing.map((f) => ({ name: f.name, seconds: 0 }))])}>{t('Add all ({n})', { n: missing.length })}</button>
      </div>
      <p class="hint">{t('Drag rows to reorder · 0 seconds = play the animation once, then the next · press BOOT on the board to skip')}</p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        <button class="btn primary" onClick={() => run(() => device.savePlaylist(host, pl), t('Playlist saved'))}>{t('Save')}</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------

