import { useState } from 'preact/hooks';
import { usbConnected } from '../device/api';
import { SerialLink } from '../device/serial';
import { connectUsb, disconnectUsb } from '../device/session';
import { toast, useEditor } from '../model/store';

export function UsbControls() {
  const s = useEditor();
  const [working, setWorking] = useState(false);
  const connected = usbConnected();
  const supported = SerialLink.supported();
  const act = async () => {
    setWorking(true);
    try {
      if (connected) await disconnectUsb();
      else { await connectUsb(); toast('เชื่อมต่อผ่าน USB แล้ว'); }
    } catch (error) {
      if ((error as DOMException).name !== 'NotFoundError') toast((error as Error).message, true);
    } finally { setWorking(false); }
  };
  return (
    <div class="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
      <button class={`btn${connected ? ' active' : ''}`} disabled={working || !supported} onClick={act}>
        {working ? connected ? 'กำลังตัดการเชื่อมต่อ...' : 'กำลังเชื่อมต่อ...'
          : connected ? 'ตัดการเชื่อมต่อ USB' : 'เชื่อมผ่าน USB'}
      </button>
      <span class="hint">
        {connected ? '● USB เชื่อมต่อแล้ว' : !supported ? 'USB: ใช้ Chrome/Edge บนคอมพิวเตอร์ และเว็บ HTTPS หรือ localhost'
          : s.deviceTransport === 'wifi' ? '● เชื่อมต่อผ่าน Wi-Fi' : 'ต่อสาย USB แล้วเลือกบอร์ด'}
      </span>
    </div>
  );
}
