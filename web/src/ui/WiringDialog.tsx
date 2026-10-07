// Wiring: which display pin goes to which board pin. The wiring is fixed per board. With a board
// connected it shows that board and its display; without one, pick the board and the display.

import { useEffect, useState } from 'preact/hooks';
import { device, presetForDevice, type DevicePreset } from '../device/api';
import { BOARDS } from '../device/boards';
import { basePresetId, PRESETS } from '../model/presets';
import { store, useEditor } from '../model/store';
import { Modal } from './common';
import { WiringGuide } from './WiringGuide';
import { t } from '../i18n';

const BOARD_NAMES = Object.entries(BOARDS).map(([id, b]) => [id, b.name]);

export function WiringDialog() {
  const s = useEditor();
  const info = s.deviceInfo;
  const host = s.deviceHost;
  const close = () => store.set({ dialog: null });

  const [board, setBoard] = useState(info?.board ?? 'c3');
  const [presetId, setPresetId] = useState(() => basePresetId((info && presetForDevice(info)) ?? s.project.presetId));

  // With a board: its own display (firmware-only variants such as SH1106 included).
  const [boardPreset, setBoardPreset] = useState<DevicePreset | null>(null);
  useEffect(() => {
    if (!info) return;
    device.presets(host).then((list) => setBoardPreset(list.find((p) => p.id === info.display.preset) ?? null), () => {});
  }, [!!info, host, info?.display.preset]);

  const connected = !!info && !!boardPreset;
  const preset: DevicePreset = (connected && boardPreset) || (PRESETS.find((p) => p.id === presetId) ?? PRESETS[1]);

  return (
    <Modal title={t('Wiring')} onClose={close}>
      {connected ? (
        <p class="hint">{t('Connected board:')} <b>{info!.name || info!.board_name}</b> · {info!.board_name} · {boardPreset!.name}</p>
      ) : (
        <div class="row">
          <span class="hint">{t('Board')}</span>
          <select value={board} onChange={(e) => setBoard((e.target as HTMLSelectElement).value)}>
            {BOARD_NAMES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <span class="hint">{t('Display')}</span>
          <select class="grow" value={presetId} onChange={(e) => setPresetId((e.target as HTMLSelectElement).value)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <WiringGuide preset={preset} board={connected ? info!.board : board} />
    </Modal>
  );
}
