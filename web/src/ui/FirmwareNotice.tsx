import type { DeviceInfo } from '../device/api';
import { firmwareInstallerUrl } from '../device/send';
import { firmwareOutdated, LATEST_FIRMWARE } from '../device/version';
import { t } from '../i18n';

// Shown wherever a connected board runs older firmware than this editor was built for.
export function FirmwareNotice({ info }: { info: DeviceInfo | null }) {
  if (!info || !firmwareOutdated(info.version)) return null;
  return (
    <div class="callout warn">
      <span class="grow">{t('The board runs older firmware than this page ({from} → {to}). Some new features may not work.', { from: info.version, to: LATEST_FIRMWARE })}</span>
      <a class="btn small" href={firmwareInstallerUrl()} target="_blank" rel="noopener">{t('Update firmware')}</a>
    </div>
  );
}
