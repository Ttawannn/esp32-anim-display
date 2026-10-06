// Board settings shared by the board manager (DeviceDialog), the phone remote and the setup wizard.

import { useEffect, useState } from 'preact/hooks';
import { device, usbConnected, type DevicePreset, type DisplaySettings, type WifiNetwork } from '../device/api';
import { connectUsb, refreshDevice } from '../device/session';
import { store, toast } from '../model/store';
import { Icon } from './common';
import { t } from '../i18n';

export async function run(fn: () => Promise<unknown>, ok?: string) {
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
export async function waitForReboot() {
  const viaUsb = usbConnected();
  toast(t('Restarting the board…'));
  await new Promise((r) => setTimeout(r, 4000));
  for (let i = 0; i < 20; i++) {
    try {
      if (viaUsb && !usbConnected()) await connectUsb(true);
      await refreshDevice();
      toast(t('The board is back'));
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  toast(t("Can't reach the board yet. If it changed Wi-Fi, reopen this page from the IP shown on its screen."), true);
}

// The name also sets the board's address on the network: "Kitchen Eyes" -> http://kitchen-eyes.local
export function BoardName({ host }: { host: string }) {
  const info = store.state.deviceInfo!;
  const [name, setName] = useState(info.name ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(info.name ?? ''), [info.name]);
  if (info.name === undefined) return null; // firmware older than 0.3.0
  const bytes = new TextEncoder().encode(name.trim()).length;
  const changed = name.trim() !== info.name;
  const save = async () => {
    setSaving(true);
    if (await run(() => device.saveName(host, name.trim()), t('Board renamed'))) await refreshDevice().catch(() => {});
    setSaving(false);
  };
  return (
    <>
      <div class="name-field">
        <span class="hint">{t('Board name')}</span>
        <input type="text" value={name} placeholder={t('Board name, e.g. desk-eyes')} maxLength={48}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && changed && bytes <= 48 && save()} />
        <button class="btn primary" disabled={!changed || saving || bytes > 48} onClick={save}>{t('Save name')}</button>
      </div>
      {info.wifi.mode === 'sta' && (
        <p class="hint" style={{ marginTop: -4 }}>
          {t('Open it from any device on the same Wi-Fi at')} <a href={`http://${info.wifi.hostname}`} target="_blank" rel="noopener">http://{info.wifi.hostname}</a>
          {' '}{t('(an English name gives an easy address)')}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

const ROTATIONS = ['0°', '90°', '180°', '270°'];

export function DisplayTab({ host }: { host: string }) {
  const [d, setD] = useState<DisplaySettings | null>(null);
  const [presets, setPresets] = useState<DevicePreset[]>([]);
  useEffect(() => {
    device.display(host).then(setD, (e) => toast((e as Error).message, true));
    device.presets(host).then(setPresets, () => {});
  }, [host]);
  if (!d) return <p class="hint">{t('Loading…')}</p>;

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
        <span class="hint">{t('Model')}</span>
        <select class="grow" value={d.preset} onChange={(e) => set({ preset: (e.target as HTMLSelectElement).value })}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div class="row">
        <span class="hint">{t('Rotation')}</span>
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
        <label class="check"><input type="checkbox" checked={d.invert} onChange={() => set({ invert: !d.invert })} /> {t('Invert colors')}</label>
        {!mono && <label class="check"><input type="checkbox" checked={d.bgr} onChange={() => set({ bgr: !d.bgr })} /> {t('Swap red/blue (BGR)')}</label>}
        {!mono && <label class="check"><input type="checkbox" checked={d.mirror_x} onChange={() => set({ mirror_x: !d.mirror_x })} /> {t('Mirror left-right')}</label>}
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
            <span class="hint">{t('SPI speed')}</span>
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
        <summary class="hint" style={{ cursor: 'pointer' }}>{t('Pins (GPIO, -1 = not connected)')}</summary>
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
        <span>{t('Brightness')}</span>
        <input type="range" min={0} max={255} value={d.brightness}
          onInput={(e) => set({ brightness: num((e.target as HTMLInputElement).value) })}
          onChange={(e) => run(() => device.brightness(host, num((e.target as HTMLInputElement).value)))} />
        <span class="v">{Math.round((d.brightness / 255) * 100)}%</span>
      </label>
      <p class="hint">
        {t('Check the test pattern: the red square must be top-left (round: at the top) · red/blue swapped → BGR · colors like a photo negative → invert · missing edge or garbage lines → offset · garbled picture → lower the speed')}
      </p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        <button class="btn" onClick={() => run(() => device.testPattern(host))}>{t('Test pattern')}</button>
        <button class="btn primary" onClick={save}>{t('Save and restart')}</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function WifiTab({ host }: { host: string }) {
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
    if (!confirm(t('Join Wi-Fi "{ssid}" and restart the board?\nAfterwards open http://{host}, or see the IP on its screen (hold BOOT for 2 seconds).', { ssid, host: info.wifi.hostname }))) return;
    if (await run(() => device.saveWifi(host, ssid, password))) await waitForReboot();
  };

  return (
    <>
      <p>
        {t('Now:')} {info.wifi.mode === 'ap'
          ? <>{t('the board runs its own Wi-Fi')} <b>{info.wifi.ssid}</b> ({t('password')} displayedit)</>
          : <>{t('joined')} <b>{info.wifi.ssid}</b> · {t('signal')} {info.wifi.rssi} dBm</>} · {info.wifi.ip} · {info.wifi.hostname}
      </p>
      <div class="row">
        <button class="btn" onClick={scan} disabled={scanning}>{scanning ? t('Searching…') : t('Find Wi-Fi networks')}</button>
      </div>
      {networks && (
        <div class="swatches" style={{ gridTemplateColumns: '1fr', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
          {networks.map((n) => (
            <button key={n.ssid} class={`card${n.ssid === ssid ? ' sel' : ''}`} style={{ padding: '6px 10px' }} onClick={() => setSsid(n.ssid)}>
              {n.ssid} <small style={{ display: 'inline' }}>{n.rssi} dBm</small>{n.secure && <span class="net-lock"><Icon name="lock" /></span>}
            </button>
          ))}
          {networks.length === 0 && <p class="hint">{t('No networks found')}</p>}
        </div>
      )}
      <div class="row">
        <input type="text" class="grow" placeholder={t('Wi-Fi name (SSID)')} value={ssid} onInput={(e) => setSsid((e.target as HTMLInputElement).value)} />
        <input type="text" class="grow" placeholder={t('Password')} value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
      </div>
      <p class="hint">{t("If it can't join within 15 seconds, the board goes back to its own Wi-Fi so you can try again.")}</p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        {info.wifi.mode === 'sta' && (
          <button class="btn" onClick={async () => {
            if (confirm(t("Forget this Wi-Fi and go back to the board's own Wi-Fi?")) && (await run(() => device.forgetWifi(host)))) await waitForReboot();
          }}>{t('Forget Wi-Fi')}</button>
        )}
        <button class="btn primary" disabled={!ssid} onClick={save}>{t('Connect and restart')}</button>
      </div>
    </>
  );
}
