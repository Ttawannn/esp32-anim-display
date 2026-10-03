import { useEffect, useRef, useState } from 'preact/hooks';
import { encodeDpa, resolveMode, type EncodeResult } from '../codec/dpa';
import { device, deviceFileName, presetForDevice } from '../device/api';
import { refreshDevice, setLive } from '../device/session';
import { getPreset } from '../model/presets';
import { retarget } from '../model/project';
import { store, toast, type EditorState } from '../model/store';
import type { Encoding } from '../model/types';
import { download } from '../storage/projectFile';
import { formatBytes, Slider } from './common';

// Free space on a fresh board (4 MB layout); replaced by the real value once a board is connected.
export const DEVICE_STORAGE = 2_000_000;

const MODE_LABEL = { indexed: 'Indexed (คมชัด ไม่เสียคุณภาพ)', jpeg: 'JPEG (เหมาะกับวิดีโอ)', mono: 'ขาวดำ 1 บิต' };

export function OutputPanel({ s }: { s: EditorState }) {
  const { project: p, deviceInfo: info } = s;
  const mode = resolveMode(p);
  const [estimate, setEstimate] = useState<EncodeResult | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const fileName = deviceFileName(p.name);

  // Re-estimate the encoded size shortly after edits settle.
  useEffect(() => {
    setEstimating(true);
    clearTimeout(timer.current);
    let cancelled = false;
    timer.current = window.setTimeout(async () => {
      try {
        const r = await encodeDpa(p);
        if (!cancelled) setEstimate(r);
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, mode === 'jpeg' ? 900 : 400);
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [p.frames, p.adjust, p.background, p.presetId, p.encoding, p.jpegQuality, p.scale, mode]);

  const encode = async () => {
    setWorking('กำลังเข้ารหัส...');
    try {
      return await encodeDpa(p, (d, t) => setWorking(`กำลังเข้ารหัส ${d}/${t}`));
    } finally {
      setWorking(null);
    }
  };

  const onDownload = async () => {
    const r = await encode();
    download(r.bytes, `${fileName}.dpa`);
  };

  const onUpload = async () => {
    try {
      const r = await encode();
      setWorking(`กำลังส่ง ${formatBytes(r.bytes.length)} ไปบอร์ด...`);
      await device.upload(s.deviceHost, fileName, r.bytes, true);
      toast(`ส่ง "${fileName}" แล้ว บอร์ดกำลังเล่น`);
      refreshDevice().catch(() => {});
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setWorking(null);
    }
  };

  const onConnect = async () => {
    setWorking('กำลังติดต่อบอร์ด...');
    try {
      const i = await refreshDevice();
      const presetId = presetForDevice(i);
      if (presetId && presetId !== p.presetId &&
          confirm(`บอร์ดใช้จอ ${getPreset(presetId).name}\nเปลี่ยนเป้าหมายของโปรเจกต์ให้ตรงกับบอร์ดไหม`)) {
        store.commit(retarget(p, presetId));
      }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setWorking(null);
    }
  };

  const size = estimate?.bytes.length ?? 0;
  const capacity = info ? info.fs.free : DEVICE_STORAGE;
  const pct = Math.min(100, (size / capacity) * 100);
  const avgFrame = estimate ? size / Math.max(1, estimate.frameSizes.length) : 0;
  const mismatch = info && presetForDevice(info) !== p.presetId;

  return (
    <div class="section">
      <h3>ส่งออก</h3>
      {mode !== 'mono' && (
        <div class="row">
          <span class="hint">รูปแบบ</span>
          <select class="grow" value={p.encoding}
            onChange={(e) => store.commit({ ...p, encoding: (e.target as HTMLSelectElement).value as Encoding })}>
            <option value="auto">อัตโนมัติ ({MODE_LABEL[resolveMode({ ...p, encoding: 'auto' })].split(' (')[0]})</option>
            <option value="indexed">{MODE_LABEL.indexed}</option>
            <option value="jpeg">{MODE_LABEL.jpeg}</option>
          </select>
        </div>
      )}
      {mode === 'jpeg' && (
        <Slider label="คุณภาพ JPEG" min={30} max={95} step={5} value={Math.round(p.jpegQuality * 100)}
          onInput={(v) => store.setLive({ ...p, jpegQuality: v / 100 })} onCommit={() => store.endLive()} />
      )}
      <div class="row">
        <span class="hint">เล่น</span>
        <select value={p.loop} onChange={(e) => store.commit({ ...p, loop: Number((e.target as HTMLSelectElement).value) })}>
          <option value={0}>วนซ้ำตลอด</option>
          {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n} รอบ</option>)}
        </select>
      </div>

      <div class="stat"><span>ขนาดไฟล์</span><b>{estimating && !estimate ? '...' : formatBytes(size)}{estimating && estimate ? ' …' : ''}</b></div>
      <div class={`bar${size > capacity ? ' over' : ''}`}><div style={{ width: `${pct}%` }} /></div>
      <div class="stat">
        <span class="hint">{pct.toFixed(1)}% ของพื้นที่{info ? 'ว่างบนบอร์ด' : 'บอร์ด'} ({formatBytes(capacity)})</span>
        <span class="hint">~{formatBytes(Math.round(avgFrame))}/เฟรม</span>
      </div>
      {estimate && mode === 'indexed' && (
        <p class="hint">
          {estimate.paletteSize} สี{!estimate.exactColors && ' (ลดจำนวนสีอัตโนมัติจากภาพที่มีมากกว่า 256 สี)'}
        </p>
      )}
      {size > capacity && <p class="warn">ไฟล์ใหญ่เกินพื้นที่ ลองลดจำนวนเฟรม ลดคุณภาพ JPEG หรือลดความละเอียด</p>}

      <div class="row" style={{ marginTop: 10 }}>
        <button class="btn grow" onClick={onDownload} disabled={!!working}>ดาวน์โหลด .dpa</button>
        <button class="btn primary grow" onClick={onUpload} disabled={!!working}>ส่งไปบอร์ด</button>
      </div>

      <div class="row" style={{ marginTop: 10 }}>
        {info ? (
          <span class="grow hint">
            <span style={{ color: 'var(--ok)' }}>●</span> {info.display.name} · {info.wifi.ip}
          </span>
        ) : (
          <span class="grow hint">○ ยังไม่ได้เชื่อมบอร์ด</span>
        )}
        <button class="btn" onClick={onConnect} disabled={!!working}>{info ? 'รีเฟรช' : 'เชื่อมต่อ'}</button>
        <button class="btn" onClick={() => store.set({ dialog: 'device' })}>จัดการบอร์ด</button>
      </div>
      {mismatch && <p class="warn">โปรเจกต์ทำสำหรับจอ {getPreset(p.presetId).name} แต่บอร์ดใช้ {info!.display.name}</p>}
      <label class="check" title="แสดงเฟรมที่กำลังแก้บนจอจริงทันที">
        <input type="checkbox" checked={s.live} disabled={!info} onChange={() => setLive(!s.live)} /> ดูสดบนบอร์ดขณะแก้ไข
      </label>
      {working && <p class="hint">{working}</p>}
    </div>
  );
}
