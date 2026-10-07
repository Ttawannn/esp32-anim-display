// Which module pin goes to which board pin: the module drawn with coloured pins next to a table
// of wires. The wiring is fixed per board (device/boards.ts, firmware board.h).

import { boardSpec, signalsFor, WIRE_COLORS } from '../device/boards';
import type { DevicePreset } from '../device/api';
import { frameFactor, ModuleFrame, modulePins } from './ModuleFrame';
import { t } from '../i18n';

function Wire({ color }: { color: string }) {
  return <span class="wire-swatch" style={{ background: color }} />;
}

export function WiringGuide(props: { preset: DevicePreset; board: string | undefined }) {
  const { preset } = props;
  const mono = preset.color === 'mono';
  const spec = boardSpec(props.board);
  const pins = spec.pins;
  const printed = modulePins(preset.id);
  const signals = signalsFor(mono).map((s) => {
    const label = s.names.find((n) => printed.includes(n));
    return { ...s, label: label ?? s.names[0], onModule: !!label };
  });

  const pinColors: Record<string, string> = { VCC: WIRE_COLORS.vcc, GND: WIRE_COLORS.gnd };
  for (const s of signals) if (s.onModule) pinColors[s.label] = WIRE_COLORS[s.key];

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
          <div key={s.key} class="wiring-row">
            <Wire color={WIRE_COLORS[s.key]} />
            <b>{s.label}{!s.onModule && <small>{t('if your module has it')}</small>}</b>
            <span class="wiring-fixed">GPIO{pins[s.key]}{spec.notes[pins[s.key]] ? ` (${spec.notes[pins[s.key]]})` : ''}</span>
          </div>
        ))}
        <ul class="wiring-notes hint">
          <li>{spec.marks === 'D'
            ? t('The board prints a D before the number: GPIO{n} is the pin marked D{n}. GPIO16 and GPIO17 are marked RX2 and TX2.', { n: pins.clk })
            : t('The board prints only the number: GPIO{n} is the pin marked {n}.', { n: pins.clk })}</li>
        </ul>
      </div>
    </div>
  );
}
