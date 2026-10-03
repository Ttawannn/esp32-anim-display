import { useState } from 'preact/hooks';
import { canvasOptions, getPreset, PRESETS } from '../model/presets';
import { createProject } from '../model/project';
import { store } from '../model/store';
import { Modal } from './common';

export function NewProjectDialog() {
  const [presetId, setPresetId] = useState(store.state.project.presetId);
  const preset = getPreset(presetId);
  const options = canvasOptions(preset);
  // Default to a chunky pixel-art size (scale 4 on 240px screens, 2 on OLEDs).
  const defaultIdx = Math.max(0, options.findIndex((o) => o.scale === (preset.width >= 200 ? 4 : preset.color === 'mono' ? 2 : 4)));
  const [optIdx, setOptIdx] = useState(defaultIdx);
  const [name, setName] = useState('animation');
  const [bg, setBg] = useState('#000000');
  const opt = options[Math.min(optIdx, options.length - 1)];

  const close = () => store.set({ dialog: null });
  const create = () => {
    store.load(createProject({ presetId, width: opt.width, height: opt.height, scale: opt.scale, name, background: bg }));
    store.set({ dialog: null, zoom: 0, tool: 'pencil', startDismissed: true, primary: preset.color === 'mono' ? '#ffffff' : store.state.primary });
  };

  return (
    <Modal title="โปรเจกต์ใหม่ (Pixel Art)" onClose={close}
      footer={<><button class="btn" onClick={close}>ยกเลิก</button><button class="btn primary" onClick={create}>สร้าง</button></>}>
      <h4 style={{ margin: '0 0 8px' }}>จอ</h4>
      <div class="cards">
        {PRESETS.map((pr) => (
          <button key={pr.id} class={`card${pr.id === presetId ? ' sel' : ''}`}
            onClick={() => { setPresetId(pr.id); setOptIdx(Math.max(0, canvasOptions(pr).findIndex((o) => o.scale === (pr.width >= 200 ? 4 : 2)))); }}>
            {pr.name}
            <small>{pr.color === 'mono' ? 'ขาวดำ' : 'สี'}{pr.round ? ' · กลม' : ''}</small>
          </button>
        ))}
      </div>
      <h4 style={{ margin: '16px 0 8px' }}>ขนาดภาพ</h4>
      <div class="cards">
        {options.map((o, i) => (
          <button key={o.scale} class={`card${i === optIdx ? ' sel' : ''}`} onClick={() => setOptIdx(i)}>
            {o.width}×{o.height}
            <small>ขยาย ×{o.scale}{o.scale >= 4 ? ' · พิกเซลใหญ่' : o.scale === 1 ? ' · ละเอียดเต็มจอ' : ''}</small>
          </button>
        ))}
      </div>
      <p class="hint">ภาพเล็ก = วาดง่าย ไฟล์เล็ก เห็นพิกเซลชัด · บอร์ดจะขยายให้เต็มจอเอง</p>
      <div class="row" style={{ marginTop: 12 }}>
        <span>ชื่อ</span>
        <input type="text" class="grow" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <span>พื้นหลัง</span>
        <input type="color" value={bg} onInput={(e) => setBg((e.target as HTMLInputElement).value)} />
      </div>
    </Modal>
  );
}
