import { useState } from 'preact/hooks';
import { usbConnected } from '../device/api';
import { SerialLink } from '../device/serial';
import { connectUsb, disconnectUsb } from '../device/session';
import { toast, useEditor } from '../model/store';
import { t } from '../i18n';

export function UsbControls() {
  const s = useEditor();
  const [working, setWorking] = useState(false);
  const connected = usbConnected();
  const supported = SerialLink.supported();
  const act = async () => {
    setWorking(true);
    try {
      if (connected) await disconnectUsb();
      else { await connectUsb(); toast(t('Connected over USB')); }
    } catch (error) {
      if ((error as DOMException).name !== 'NotFoundError') toast((error as Error).message, true);
    } finally { setWorking(false); }
  };
  return (
    <div class="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
      <button class={`btn${connected ? ' active' : ''}`} disabled={working || !supported} onClick={act}>
        {working ? connected ? t('Disconnecting…') : t('Connecting…')
          : connected ? t('Disconnect USB') : t('Connect over USB')}
      </button>
      <span class="hint">
        {connected ? `● ${t('Connected over USB')}` : !supported ? t('USB needs Chrome/Edge on a computer, over HTTPS or localhost')
          : s.deviceTransport === 'wifi' ? `● ${t('Connected over Wi-Fi')}` : t('Plug in the USB cable, then pick the board')}
      </span>
    </div>
  );
}
