import { allowedRotations, presetRotation, withRotation } from '../model/presets';
import { t } from '../i18n';

// How the module is mounted: 0° / 90° / 180° / 270° (1-bit OLEDs: 0° / 180°). The file carries
// the rotation, and the board turns the panel to match when it plays it.
export function RotationPicker({ presetId, onChange }: { presetId: string; onChange: (id: string) => void }) {
  const current = presetRotation(presetId);
  const options = allowedRotations(presetId);
  return (
    <div class="rotation-picker">
      <span class="hint">{t('Rotation')}</span>
      <div class="seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="radiogroup" aria-label={t('Rotation')}>
        {options.map((r) => (
          <button key={r} role="radio" aria-checked={current === r} class={current === r ? 'active' : ''}
            onClick={() => onChange(withRotation(presetId, r))}>{r * 90}°</button>
        ))}
      </div>
    </div>
  );
}
