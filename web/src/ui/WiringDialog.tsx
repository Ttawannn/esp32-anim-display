// Wiring: which display pin goes to which board pin, with every GPIO selectable. With a board
// connected it edits that board's pins (saved on the board, then it restarts). Without one, pick the
// board and display; the choice is kept in this browser and the setup wizard starts from it.

import { useEffect, useState } from 'preact/hooks';
import { device, presetForDevice, type DevicePreset } from '../device/api';
import { BOARDS, boardSpec, pinConflicts, rememberedPins, rememberPins, samePins, type Pins } from '../device/boards';
import { basePresetId, PRESETS } from '../model/presets';
import { store, useEditor } from '../model/store';
import { run, waitForReboot } from './BoardSettings';
import { Modal } from './common';
import { WiringGuide } from './WiringGuide';
import { t } from '../i18n';

const BOARD_NAMES = Object.entries(BOARDS).map(([id, b]) => [id, b.name]);

export function WiringDialog() {
  const s = useEditor();
  const info = s.deviceInfo;
  const host = s.deviceHost;
  const close = () => store.set({ dialog: null });

  // Without a board: free choice of board and display.
  const [board, setBoard] = useState(info?.board ?? 'c3');
  const [presetId, setPresetId] = useState(() => basePresetId((info && presetForDevice(info)) ?? s.project.presetId));
  const [pins, setPins] = useState<Pins>(() => rememberedPins(board) ?? boardSpec(board).defaults);

  // With a board: its display and its saved pins.
  const [boardPreset, setBoardPreset] = useState<DevicePreset | null>(null);
  const [saved, setSaved] = useState<Pins | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!info) return;
    device.display(host).then((d) => {
      setSaved(d.pins);
      setPins(d.pins);
      device.presets(host).then((list) => setBoardPreset(list.find((p) => p.id === d.preset) ?? null), () => {});
    }, () => {}); // unreachable board: stay in the board-less mode
  }, [!!info, host]);

  const connected = !!info && !!saved;
  const preset: DevicePreset = (connected && boardPreset) || (PRESETS.find((p) => p.id === presetId) ?? PRESETS[1]);
  const activeBoard = connected ? info!.board : board;
  const conflicts = pinConflicts(pins, preset.color === 'mono').size > 0;

  const change = (next: Pins) => {
    setPins(next);
    if (!connected) rememberPins(board, next);
  };
  const pickBoard = (b: string) => {
    setBoard(b);
    setPins(rememberedPins(b) ?? boardSpec(b).defaults);
  };
  const save = async () => {
    setSaving(true);
    if (await run(() => device.saveDisplay(host, { pins }))) {
      setSaved(pins);
      await waitForReboot();
    }
    setSaving(false);
  };

  return (
    <Modal title={t('Wiring')} onClose={close}>
      {connected ? (
        <p class="hint">{t('Connected board:')} <b>{info!.name || info!.board_name}</b> · {info!.board_name} · {boardPreset?.name ?? info!.display.name}</p>
      ) : (
        <div class="row">
          <span class="hint">{t('Board')}</span>
          <select value={board} onChange={(e) => pickBoard((e.target as HTMLSelectElement).value)}>
            {BOARD_NAMES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <span class="hint">{t('Display')}</span>
          <select class="grow" value={presetId} onChange={(e) => setPresetId((e.target as HTMLSelectElement).value)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <WiringGuide preset={preset} board={activeBoard} pins={pins} onChange={change} />
      {connected ? (
        <div class="row" style={{ justifyContent: 'flex-end' }}>
          <span class="hint grow">{t('The board restarts to use new pins.')}</span>
          <button class="btn primary" disabled={saving || conflicts || samePins(pins, saved!)} onClick={save}>{t('Save and restart')}</button>
        </div>
      ) : (
        <p class="hint">{t('Your pins are kept in this browser. When you connect this board, the setup wizard uses them.')}</p>
      )}
    </Modal>
  );
}
