import { useState } from 'preact/hooks';
import { presetForDevice, usbConnected } from '../device/api';
import { SerialLink } from '../device/serial';
import { firmwareInstallerUrl } from '../device/send';
import { connectUsb, disconnectUsb, refreshDevice, setLive } from '../device/session';
import { getPreset } from '../model/presets';
import { retarget } from '../model/project';
import { store, toast, useEditor } from '../model/store';
import { Icon } from './common';
import { useDismiss } from './Menu';

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
  const mismatch = !!devicePreset && devicePreset !== s.project.presetId;

  const label = info ? (usb ? 'USB' : 'Wi-Fi') : 'ยังไม่เชื่อมบอร์ด';

  return (
    <div class="menu" ref={ref}>
      <button class={`chip${info ? ' on' : ''}${open ? ' active' : ''}`} onClick={() => setOpen(!open)}
        title="การเชื่อมต่อบอร์ด">
        <span class="dot" />
        <Icon name={info ? (usb ? 'usb' : 'wifi') : 'board'} />
        <span class="lbl">{label}</span>
        {s.live && <span class="badge">LIVE</span>}
      </button>
      {open && (
        <div class="menu-panel right popover">
          {info ? (
            <div class="conn-status">
              <div class="conn-title"><span class="dot on" /> เชื่อมต่อแล้วผ่าน {usb ? 'USB' : 'Wi-Fi'}</div>
              <div class="hint">{info.board_name} · {info.display.name}{!usb && ` · ${info.wifi.ip}`}</div>
              {mismatch && (
                <div class="callout warn">
                  โปรเจกต์นี้ทำสำหรับ {getPreset(s.project.presetId).name} แต่บอร์ดใช้ {info.display.name}
                  <button class="btn small" onClick={() => store.commit(retarget(s.project, devicePreset!))}>ใช้จอของบอร์ด</button>
                </div>
              )}
              <label class="toggle">
                <input type="checkbox" checked={s.live} onChange={() => setLive(!s.live)} />
                <span class="track" />
                <span><b>ดูสดบนบอร์ด</b><small>แสดงเฟรมที่กำลังแก้บนจอจริงทันที</small></span>
              </label>
              <div class="row">
                <button class="btn grow" onClick={() => { setOpen(false); store.set({ dialog: 'device' }); }}>
                  <Icon name="board" /> จัดการบอร์ด
                </button>
                {usb ? (
                  <button class="btn" disabled={!!working} onClick={() => run('ตัดการเชื่อมต่อ', disconnectUsb)}>ตัดการเชื่อมต่อ</button>
                ) : (
                  <button class="btn" disabled={!!working} onClick={() => run('รีเฟรช', refreshDevice)}>รีเฟรช</button>
                )}
              </div>
            </div>
          ) : (
            <div class="conn-status">
              <div class="conn-title">เชื่อมต่อบอร์ด</div>
              <button class="conn-option" disabled={!usbSupported || !!working}
                onClick={() => run('USB', async () => { await connectUsb(); toast('เชื่อมต่อผ่าน USB แล้ว'); })}>
                <Icon name="usb" />
                <span><b>ผ่านสาย USB</b>
                  <small>{usbSupported ? 'เสียบสาย แล้วเลือกบอร์ดจากรายการ' : 'ใช้ได้กับ Chrome/Edge บนคอมพิวเตอร์ (หน้า HTTPS หรือ localhost)'}</small>
                </span>
              </button>
              <div class={`conn-option static${https ? ' disabled' : ''}`}>
                <Icon name="wifi" />
                <span><b>ผ่าน Wi-Fi</b>
                  <small>{https ? 'เว็บออนไลน์ใช้ Wi-Fi ไม่ได้ — เปิดหน้าเว็บจากบอร์ด (http://192.168.4.1)'
                    : 'อยู่ใน Wi-Fi เดียวกับบอร์ด แล้วใส่ IP (ว่าง = บอร์ดที่เปิดหน้านี้)'}</small>
                  {!https && (
                    <span class="row">
                      <input type="text" class="grow" placeholder="192.168.4.1" value={s.deviceHost}
                        onChange={(e) => { store.set({ deviceHost: (e.target as HTMLInputElement).value }); store.savePrefs(); }} />
                      <button class="btn primary" disabled={!!working} onClick={() => run('Wi-Fi', refreshDevice)}>เชื่อมต่อ</button>
                    </span>
                  )}
                </span>
              </div>
              <p class="hint" style={{ margin: '12px 0 0' }}>
                บอร์ดยังไม่มีเฟิร์มแวร์? <a href={firmwareInstallerUrl()} target="_blank" rel="noopener">ติดตั้งจากเบราว์เซอร์</a>
              </p>
            </div>
          )}
          {working && <div class="hint">กำลัง{working}...</div>}
        </div>
      )}
    </div>
  );
}
