// Which module pin goes to which board pin: the module drawn with coloured pins next to a table
// of wires. Each signal's GPIO can be changed; the defaults come from the board (device/boards.ts).

import { boardSpec, pinConflicts, signalsFor, WIRE_COLORS, type PinKey, type Pins } from '../device/boards';
import type { DevicePreset } from '../device/api';
import { frameFactor, ModuleFrame, modulePins } from './ModuleFrame';
import { Icon } from './common';
import { t } from '../i18n';

function Wire({ color }: { color: string }) {
  return <span class="wire-swatch" style={{ background: color }} />;
}

export function WiringGuide(props: { preset: DevicePreset; board: string | undefined; pins: Pins; onChange: (pins: Pins) => void }) {
  const { pins, preset } = props;
  const mono = preset.color === 'mono';
  const spec = boardSpec(props.board);
  const printed = modulePins(preset.id);
  const signals = signalsFor(mono).map((s) => {
    const label = s.names.find((n) => printed.includes(n));
    return { ...s, label: label ?? s.names[0], onModule: !!label };
  });
  const conflicts = pinConflicts(pins, mono);

  const pinColors: Record<string, string> = { VCC: WIRE_COLORS.vcc, GND: WIRE_COLORS.gnd };
  for (const s of signals) if (s.onModule && pins[s.key] >= 0) pinColors[s.label] = WIRE_COLORS[s.key];

  const set = (key: PinKey, pin: number) => {
    const next = { ...pins, [key]: pin };
    // A signal this display doesn't use (e.g. DC on an OLED) gives up the pin instead of blocking it.
    const used = signals.map((s) => s.key);
    for (const k of Object.keys(next) as PinKey[]) if (k !== key && !used.includes(k) && next[k] === pin && pin >= 0) next[k] = -1;
    props.onChange(next);
  };

  const { fx, fy } = frameFactor(preset.id);
  const zoom = Math.min(220 / (preset.width * fx), 250 / (preset.height * fy));

  return (
    <div class="wiring">
      <div class="wiring-module">
        <ModuleFrame presetId={preset.id} screenW={preset.width * zoom} screenH={preset.height * zoom} pinColors={pinColors}>
          <span />
        </ModuleFrame>
      </div>
      <div class="wiring-table">
        <div class="wiring-head hint"><span>{t('Display pin')}</span><span>{t('Board pin')}</span></div>
        <div class="wiring-row"><Wire color={WIRE_COLORS.vcc} /><b>VCC</b><span class="wiring-fixed">3V3</span></div>
        <div class="wiring-row"><Wire color={WIRE_COLORS.gnd} /><b>GND</b><span class="wiring-fixed">GND</span></div>
        {signals.map((s) => (
          <div key={s.key} class={`wiring-row${conflicts.has(s.key) ? ' bad' : ''}`}>
            <Wire color={pins[s.key] >= 0 ? WIRE_COLORS[s.key] : 'transparent'} />
            <b>{s.label}{!s.onModule && <small>{t('if your module has it')}</small>}</b>
            <select value={pins[s.key]} onChange={(e) => set(s.key, Number((e.target as HTMLSelectElement).value))}>
              {s.optional && <option value={-1}>{t('Not wired')}</option>}
              {!spec.usable.includes(pins[s.key]) && pins[s.key] >= 0 && <option value={pins[s.key]}>GPIO{pins[s.key]} ({t('not on this board')})</option>}
              {spec.usable.map((n) => (
                <option key={n} value={n}>
                  GPIO{n}{spec.notes[n] ? ` (${spec.notes[n]})` : ''}{spec.defaults[s.key] === n ? ` · ${t('default')}` : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
        <ul class="wiring-notes hint">
          {conflicts.size > 0 && <li class="bad">{t('The same board pin is used twice. Pick another pin for the red rows.')}</li>}
          {!mono && pins.rst < 0 && <li>{t('RES not connected: tie RES to 3V3.')}</li>}
          {!mono && pins.bl < 0 && <li>{t('BLK not connected: leave it open or tie it to 3V3. Brightness then stays at full.')}</li>}
          {!mono && (pins.clk !== spec.defaults.clk || pins.data !== spec.defaults.data) && <li>{t('SPI is fastest with CLK on GPIO{clk} and DATA on GPIO{data}. On other pins, lower the SPI speed if the picture is garbled.', { clk: spec.defaults.clk, data: spec.defaults.data })}</li>}
          <li>{spec.marks === 'D'
            ? t('The board prints a D before the number: GPIO{n} is the pin marked D{n}. GPIO16 and GPIO17 are marked RX2 and TX2.', { n: spec.defaults.clk })
            : t('The board prints only the number: GPIO{n} is the pin marked {n}.', { n: spec.defaults.clk })}</li>
        </ul>
        <button class="btn small" disabled={signals.every((s) => pins[s.key] === spec.defaults[s.key])}
          onClick={() => props.onChange({ ...spec.defaults })}>
          <Icon name="undo" /> {t('Reset to default')}
        </button>
      </div>
    </div>
  );
}
