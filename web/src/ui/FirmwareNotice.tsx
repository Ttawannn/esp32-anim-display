import type { DeviceInfo } from '../device/api';
import { firmwareInstallerUrl } from '../device/send';
import { firmwareOutdated, LATEST_FIRMWARE } from '../device/version';

// Shown wherever a connected board runs older firmware than this editor was built for.
export function FirmwareNotice({ info }: { info: DeviceInfo | null }) {
  if (!info || !firmwareOutdated(info.version)) return null;
  return (
    <div class="callout warn">
      <span class="grow">เฟิร์มแวร์บนบอร์ดเก่ากว่าเว็บ ({info.version} → {LATEST_FIRMWARE}) ฟีเจอร์ใหม่บางอย่างอาจใช้ไม่ได้</span>
      <a class="btn small" href={firmwareInstallerUrl()} target="_blank" rel="noopener">อัปเดตเฟิร์มแวร์</a>
    </div>
  );
}
