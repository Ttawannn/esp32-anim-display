import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getPreset } from '../model/presets';
import { createProject, newFrame, totalDuration } from '../model/project';
import { store, toast } from '../model/store';
import type { Project } from '../model/types';
import { outputFrame } from '../render/output';
import { composeScreen } from '../render/screen';
import { EYE_ANIMS, generateEyes, type EyeOptions, type EyeStyle, type GeneratedEyes } from '../templates/eyes';
import { Modal, Slider } from './common';

const STYLES: { id: EyeStyle; name: string; hint: string }[] = [
  { id: 'robot', name: 'หุ่นยนต์', hint: 'สี่เหลี่ยมมน เรียบง่าย' },
  { id: 'cartoon', name: 'การ์ตูน', hint: 'ตาขาว ม่านตา แววตา' },
  { id: 'single', name: 'ตาเดียว', hint: 'ลูกตาใหญ่ เหมาะจอกลม' },
];

export function EyesDialog() {
  const current = store.state.project;
  const preset = getPreset(current.presetId);
  const mono = preset.color === 'mono';
  const [animId, setAnimId] = useState('look-lr');
  const [o, setO] = useState<EyeOptions>({
    style: preset.round ? 'single' : 'robot',
    eyeColor: '#2ee6ff',
    irisColor: '#3a8dde',
    bgColor: '#000000',
    size: 1,
    spacing: 1,
    fps: 20,
    pixel: 1,
    rotate: preset.height > preset.width * 1.5 ? 90 : 0,
    mono,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anim = EYE_ANIMS.find((a) => a.id === animId)!;
  const set = (patch: Partial<EyeOptions>) => setO({ ...o, ...patch });

  const gen = useMemo(() => generateEyes(preset.width, preset.height, anim, o), [animId, o, preset]);

  const toProject = (g: GeneratedEyes, name: string): Project => {
    const p = createProject({
      presetId: preset.id, width: g.width, height: g.height, scale: g.scale, name, background: mono ? '#000000' : o.bgColor,
      frames: g.frames.map((f) => newFrame(g.width, g.height, f.delay, f.data)),
    });
    if (mono) p.adjust.dither = 'none';
    return p;
  };

  const preview = useMemo(() => toProject(gen, anim.name), [gen]);

  // Loop the generated animation in the preview using each frame's delay.
  useEffect(() => {
    let i = 0, timer = 0;
    const tick = () => {
      const p = preview;
      const img = composeScreen(p, outputFrame(p, p.frames[i]), store.state.oledTint);
      canvasRef.current?.getContext('2d')!.putImageData(img, 0, 0);
      timer = window.setTimeout(tick, p.frames[i].delay);
      i = (i + 1) % p.frames.length;
    };
    tick();
    return () => clearTimeout(timer);
  }, [preview]);

  const close = () => store.set({ dialog: null });

  const finish = (p: Project, msg: string) => {
    store.load(p);
    store.set({ dialog: null, zoom: 0, playing: true });
    toast(msg);
  };

  const createNew = () => finish(preview, `สร้าง "${anim.name}" ${preview.frames.length} เฟรมแล้ว`);

  const canAppend = current.width === gen.width && current.height === gen.height && current.scale === gen.scale;
  const append = () => {
    const frames = gen.frames.map((f) => newFrame(gen.width, gen.height, f.delay, f.data));
    store.commit({ ...current, frames: [...current.frames, ...frames] }, current.frames.length);
    store.set({ dialog: null });
    toast(`ต่อท้าย "${anim.name}" ${frames.length} เฟรมแล้ว`);
  };

  const createAll = () => {
    const all = EYE_ANIMS.filter((a) => a.id !== 'look-around').flatMap((a) => generateEyes(preset.width, preset.height, a, o).frames);
    finish(toProject({ ...gen, frames: all }, 'อารมณ์รวม'), `สร้างรวมทุกอารมณ์ ${all.length} เฟรมแล้ว`);
  };

  const zoom = Math.max(1, Math.min(Math.floor(280 / preset.width), Math.floor(280 / preset.height)));

  return (
    <Modal title="แม่แบบดวงตา" onClose={close}
      footer={<>
        <button class="btn" onClick={createAll} title="ต่อทุกท่าเป็นแอนิเมชันเดียว (ยกเว้นมองรอบ ๆ)">รวมทุกอารมณ์</button>
        <button class="btn" onClick={append} disabled={!canAppend}
          title={canAppend ? 'เพิ่มต่อท้ายเฟรมของโปรเจกต์ปัจจุบัน' : 'ขนาดภาพไม่ตรงกับโปรเจกต์ปัจจุบัน'}>ต่อท้ายโปรเจกต์นี้</button>
        <button class="btn primary" onClick={createNew}>สร้างโปรเจกต์ใหม่</button>
      </>}>
      <div class="cols">
        <div>
          <div class="device">
            <div class={`bezel${preset.round ? ' round' : ''}`}>
              <canvas ref={canvasRef} width={preset.width} height={preset.height}
                style={{ width: preset.width * zoom, height: preset.height * zoom }} />
            </div>
          </div>
          <p class="preview-info">
            {anim.name} · {gen.frames.length} เฟรม · {(totalDuration(preview) / 1000).toFixed(1)} วินาที · {preset.name}
          </p>
        </div>
        <div>
          <div class="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
            {EYE_ANIMS.map((a) => (
              <button key={a.id} class={`card${a.id === animId ? ' sel' : ''}`} onClick={() => setAnimId(a.id)}>
                <span style={{ fontSize: 18 }}>{a.emoji}</span> {a.name}
              </button>
            ))}
          </div>
          <h4 style={{ margin: '14px 0 8px' }}>รูปแบบ</h4>
          <div class="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {STYLES.map((s) => (
              <button key={s.id} class={`card${s.id === o.style ? ' sel' : ''}`} onClick={() => set({ style: s.id })}>
                {s.name}<small>{s.hint}</small>
              </button>
            ))}
          </div>
          {!mono && (
            <div class="row" style={{ marginTop: 10 }}>
              {o.style === 'robot' ? (
                <><span class="hint">สีตา</span>
                  <input type="color" value={o.eyeColor} onInput={(e) => set({ eyeColor: (e.target as HTMLInputElement).value })} /></>
              ) : (
                <><span class="hint">สีม่านตา</span>
                  <input type="color" value={o.irisColor} onInput={(e) => set({ irisColor: (e.target as HTMLInputElement).value })} /></>
              )}
              <span class="hint">พื้นหลัง</span>
              <input type="color" value={o.bgColor} onInput={(e) => set({ bgColor: (e.target as HTMLInputElement).value })} />
            </div>
          )}
          <Slider label="ขนาดตา" min={0.6} max={1.3} step={0.05} value={o.size} format={(v) => `${Math.round(v * 100)}%`}
            onInput={(v) => set({ size: v })} />
          {o.style !== 'single' && (
            <Slider label="ระยะห่าง" min={0.4} max={1.6} step={0.05} value={o.spacing} format={(v) => `${Math.round(v * 100)}%`}
              onInput={(v) => set({ spacing: v })} />
          )}
          <div class="row">
            <span class="hint">ความลื่น</span>
            <select value={o.fps} onChange={(e) => set({ fps: Number((e.target as HTMLSelectElement).value) })}>
              {[10, 15, 20, 25, 30].map((f) => <option key={f} value={f}>{f} fps</option>)}
            </select>
            {!mono && (
              <select value={o.pixel} onChange={(e) => set({ pixel: Number((e.target as HTMLSelectElement).value) })}>
                <option value={1}>ละเอียด ขอบเรียบ</option>
                <option value={2}>พิกเซล ×2</option>
                <option value={4}>พิกเซล ×4 (ไฟล์เล็กสุด)</option>
              </select>
            )}
          </div>
          {preset.height !== preset.width && (
            <div class="row">
              <span class="hint">ติดจอ</span>
              <select value={o.rotate} onChange={(e) => set({ rotate: Number((e.target as HTMLSelectElement).value) as EyeOptions['rotate'] })}>
                <option value={0}>ตามปกติ</option>
                <option value={90}>แนวนอน (หมุน 90°)</option>
                <option value={270}>แนวนอน (หมุน 270°)</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
