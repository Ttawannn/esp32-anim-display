import { useState } from 'preact/hooks';
import { presetForDevice, usbConnected } from '../device/api';
import { SerialLink } from '../device/serial';
import { firmwareInstallerUrl } from '../device/send';
import { firmwareOutdated } from '../device/version';
import { connectUsb, disconnectUsb, refreshDevice, setLive } from '../device/session';
import { getPreset, sameDisplay } from '../model/presets';
import { useBoardDisplay } from '../model/project';
import { store, toast, useEditor } from '../model/store';
import { Icon } from './common';
import { FirmwareNotice } from './FirmwareNotice';
import { openSetupWizard } from './SetupWizard';
import { useDismiss } from './Menu';
import { t } from '../i18n';

// Board connection in one place: status chip in the top bar, popover with USB / Wi-Fi,
// live preview, display mismatch and a link to the board manager.
export function ConnectionChip() {
  const s = useEditor();
  const info = s.deviceInfo;
  const open = s.connectOpen;
  const setOpen = (v: boolean) => store.set({ connectOpen: v });
  const ref = useDismiss(open, () => setOpen(false));
  const [working, setWorking] = useState<string | null>(null);
  const usb = usbConnected();
  const usbSupported = SerialLink.supported();
  const https = location.protocol === 'https:';

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setWorking(label);
    try {
      await fn();
    } catch (e) {
      if ((e as DOMException).name !== 'NotFoundError') toast((e as Error).message, true);
    } finally {
      setWorking(null);
    }
  };

  const devicePreset = info ? presetForDevice(info) : null;
  const mismatch = !!devicePreset && !sameDisplay(devicePreset, s.project.presetId);

  const label = info ? info.name || (usb ? 'USB' : 'Wi-Fi') : t('No board connected');
  const outdated = !!info && firmwareOutdated(info.version);

  return (
    <div class="menu" ref={ref}>
      <button class={`chip${info ? ' on' : ''}${open ? ' active' : ''}`} onClick={() => setOpen(!open)}
        title={t('Board connection')}>
        <span class={`dot${outdated ? ' warn' : ''}`} title={outdated ? t('The board runs old firmware') : undefined} />
        <Icon name={info ? (usb ? 'usb' : 'wifi') : 'board'} />
        <span class="lbl">{label}</span>
        {s.live && <span class="badge">LIVE</span>}
      </button>
      {open && (
        <div class="menu-panel right popover">
          {info ? (
            <div class="conn-status">
              <div class="conn-title"><span class="dot on" /> {t('Connected over {via}', { via: usb ? 'USB' : 'Wi-Fi' })}</div>
              <div class="hint">{info.name && <b>{info.name} · </b>}{info.board_name} · {info.display.name}{!usb && ` · ${info.wifi.ip}`}</div>
              <FirmwareNotice info={info} />
              {mismatch && (
                <div class="callout warn">
                  {t('This project is for the {a}, but the board has the {b}', { a: getPreset(s.project.presetId).name, b: info.display.name })}
                  <button class="btn small" onClick={() => store.commit(useBoardDisplay(s.project, devicePreset!))}>{t("Use the board's display")}</button>
                </div>
              )}
              <label class="toggle">
                <input type="checkbox" checked={s.live} onChange={() => setLive(!s.live)} />
                <span class="track" />
                <span><b>{t('Live preview on the board')}</b><small>{t('Shows the frame you are editing on the real screen right away')}</small></span>
              </label>
              <div class="row">
                <button class="btn grow" onClick={() => { setOpen(false); store.set({ dialog: 'device' }); }}>
                  <Icon name="board" /> {t('Board manager')}
                </button>
                {usb ? (
                  <button class="btn" disabled={!!working} onClick={() => run(t('Disconnecting'), disconnectUsb)}>{t('Disconnect')}</button>
                ) : (
                  <button class="btn" disabled={!!working} onClick={() => run(t('Refreshing'), refreshDevice)}>{t('Refresh')}</button>
                )}
              </div>
              <button class="btn wide" onClick={() => { setOpen(false); openSetupWizard(); }}>
                <Icon name="sparkle" /> {t('Re-run setup')}
              </button>
            </div>
          ) : (
            <div class="conn-status">
              <div class="conn-title">{t('Connect to a board')}</div>
              <button class="conn-option" disabled={!usbSupported || !!working}
                onClick={() => run(t('Connecting over USB'), async () => { await connectUsb(); toast(t('Connected over USB')); })}>
                <Icon name="usb" />
                <span><b>{t('Over a USB cable')}</b>
                  <small>{usbSupported ? t('Plug in the cable, then pick the board from the list') : t('Works in Chrome/Edge on a computer (HTTPS or localhost page)')}</small>
                </span>
              </button>
              <div class={`conn-option static${https ? ' disabled' : ''}`}>
                <Icon name="wifi" />
                <span><b>{t('Over Wi-Fi')}</b>
                  <small>{https ? t("The online editor can't use Wi-Fi. Open the page from the board (http://192.168.4.1).")
                    : t('Be on the same Wi-Fi as the board, then enter its IP (empty = the board serving this page)')}</small>
                  {!https && (
                    <span class="row">
                      <input type="text" class="grow" placeholder="192.168.4.1" value={s.deviceHost}
                        onChange={(e) => { store.set({ deviceHost: (e.target as HTMLInputElement).value }); store.savePrefs(); }} />
                      <button class="btn primary" disabled={!!working} onClick={() => run(t('Connecting over Wi-Fi'), refreshDevice)}>{t('Connect')}</button>
                    </span>
                  )}
                </span>
              </div>
              <p class="hint" style={{ margin: '12px 0 0' }}>
                {t('No firmware on the board yet?')} <a href={firmwareInstallerUrl()} target="_blank" rel="noopener">{t('Install it from the browser')}</a>
              </p>
              <button class="btn wide" style={{ marginTop: 8 }} onClick={() => { setOpen(false); store.set({ dialog: 'wiring' }); }}>
                <Icon name="cable" /> {t('How to wire the display')}
              </button>
            </div>
          )}
          {working && <div class="hint">{working}…</div>}
        </div>
      )}
    </div>
  );
}
