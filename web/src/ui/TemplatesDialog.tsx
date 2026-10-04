// Gallery of generated animations: pick one, tweak colours/options, create a project (or send it
// to the board right away).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { encodeProject } from '../codec/encode';
import { sendToBoard } from '../device/send';
import { clockTimeOf } from '../layers/clock';
import { clockOverlay } from '../layers/preview';
import { widgetsFor } from '../layers/raster';
import { getPreset } from '../model/presets';
import { totalDuration } from '../model/project';
import { store, toast } from '../model/store';
import type { Project } from '../model/types';
import { outputFrame } from '../render/output';
import { composeScreen } from '../render/screen';
import { CATEGORIES, TEMPLATES, templateProject, type AnimTemplate, type CategoryId, type Options } from '../templates/gallery';
import { formatBytes, Modal } from './common';

let initialTemplate = 'clock';
export function openTemplates(id?: string) {
  if (id) initialTemplate = id;
  store.set({ dialog: 'templates' });
}

// Thumbnails: generated once per template and display. Colour panels draw the raw canvas frames;
// 1-bit panels draw the real output so the thumbnail shows what the OLED will.
const thumbCache = new Map<string, Project>();
const canvasCache = new WeakMap<Uint8ClampedArray, OffscreenCanvas>();
function frameCanvas(p: Project, i: number, mono: boolean) {
  const data = p.frames[i].data;
  let c = canvasCache.get(data);
  if (!c) {
    if (mono) {
      const img = composeScreen(p, outputFrame(p, p.frames[i]), store.state.oledTint);
      c = new OffscreenCanvas(img.width, img.height);
      c.getContext('2d')!.putImageData(img, 0, 0);
    } else {
      c = new OffscreenCanvas(p.width, p.height);
      c.getContext('2d')!.putImageData(new ImageData(data, p.width, p.height), 0, 0);
    }
    canvasCache.set(data, c);
  }
  return c;
}

function Thumb({ t, presetId, tick }: { t: AnimTemplate; presetId: string; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = `${t.id}|${presetId}`;
  const [p, setP] = useState<Project | null>(() => thumbCache.get(key) ?? null);
  useEffect(() => {
    if (p) return;
    // Spread generation over idle time so the dialog opens instantly.
    const id = setTimeout(() => {
      try {
        const proj = templateProject(t, presetId, {});
        thumbCache.set(key, proj);
        setP(proj);
      } catch { /* shows the emoji instead */ }
    }, 30 + TEMPLATES.indexOf(t) * 25);
    return () => clearTimeout(id);
  }, [key]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !p) return;
    const preset = getPreset(presetId);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, c.width, c.height);
    const k = c.width / preset.width; // canvas keeps the panel's aspect ratio
    const mono = preset.color === 'mono';
    const f = frameCanvas(p, tick % p.frames.length, mono);
    if (mono) ctx.drawImage(f, 0, 0, c.width, c.height);
    else ctx.drawImage(f, p.offsetX * k, p.offsetY * k, p.width * p.scale * k, p.height * p.scale * k);
    if (p.layers?.length) {
      const o = clockOverlay(p, preset.width, preset.height);
      if (o) { ctx.imageSmoothingEnabled = true; ctx.drawImage(o, 0, 0, c.width, c.height); }
    }
  }, [p, tick]);
  const preset = getPreset(presetId);
  const fit = Math.min(120 / preset.width, 96 / preset.height);
  return p
    ? <canvas ref={ref} width={Math.round(preset.width * fit)} height={Math.round(preset.height * fit)} class={preset.round ? 'round' : ''} />
    : <span class="thumb-wait">{t.emoji}</span>;
}

export function TemplatesDialog() {
  const presetId = store.state.project.presetId;
  const preset = getPreset(presetId);
  const mono = preset.color === 'mono';
  const [id, setId] = useState(initialTemplate);
  const [cat, setCat] = useState<CategoryId | 'all'>('all');
  const [opts, setOpts] = useState<Record<string, Options>>({});
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  const o = { ...t.defaults, ...opts[t.id] };
  const setOpt = (k: string, v: string) => setOpts({ ...opts, [t.id]: { ...opts[t.id], [k]: v } });

  const project = useMemo(() => {
    try { return templateProject(t, presetId, o, speed); }
    catch (e) { toast((e as Error).message, true); return null; }
  }, [t, presetId, JSON.stringify(o), speed]);

  // Thumbnail animation clock.
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 90);
    return () => clearInterval(i);
  }, []);

  // Big preview, exactly as the panel will show it (colour depth, round mask, live clock).
  useEffect(() => {
    if (!project) return;
    let i = 0, timer = 0;
    let clock: Parameters<typeof composeScreen>[3];
    try {
      const w = widgetsFor(project);
      clock = w ? { parsed: w.parsed, time: clockTimeOf(new Date()) } : undefined;
    } catch { /* too large; still preview the frames */ }
    const draw = () => {
      if (clock) clock.time = clockTimeOf(new Date());
      const img = composeScreen(project, outputFrame(project, project.frames[i]), store.state.oledTint, clock);
      canvasRef.current?.getContext('2d')!.putImageData(img, 0, 0);
      timer = window.setTimeout(draw, project.frames[i].delay);
      i = (i + 1) % project.frames.length;
    };
    draw();
    return () => clearTimeout(timer);
  }, [project]);

  // File size estimate (encoded in the worker).
  useEffect(() => {
    if (!project) return;
    setSize(null);
    const ctl = new AbortController();
    const timer = setTimeout(() => encodeProject(project, undefined, ctl.signal).then((r) => setSize(r.bytes.length), () => {}), 250);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [project]);

  const close = () => store.set({ dialog: null });
  const create = () => {
    if (!project) return null;
    store.load({ ...project, name: t.name });
    store.set({ dialog: null, zoom: 0, playing: true, startDismissed: true, selectedLayer: null });
    return project;
  };
  const createOnly = () => { if (create()) toast(`สร้าง "${t.name}" ${project!.frames.length} เฟรมแล้ว`); };
  const createAndSend = () => { if (create()) sendToBoard(); };

  const zoom = Math.min(260 / preset.width, 260 / preset.height);
  const shown = TEMPLATES.filter((x) => cat === 'all' || x.category === cat);
  const visibleOptions = t.options.filter((op) => !(mono && op.type === 'color'));

  return (
    <Modal title="แม่แบบแอนิเมชัน" onClose={close}
      footer={<>
        <span class="hint grow">สร้างให้พอดีกับจอ {preset.name}</span>
        <button class="btn" onClick={createOnly} disabled={!project}>สร้างโปรเจกต์</button>
        <button class="btn primary" onClick={createAndSend} disabled={!project}>สร้างแล้วส่งไปบอร์ด</button>
      </>}>
      <div class="tpl">
        <div class="tpl-side">
          <div class="device">
            <div class={`bezel${preset.round ? ' round' : ''}`}>
              <canvas ref={canvasRef} width={preset.width} height={preset.height}
                style={{ width: preset.width * zoom, height: preset.height * zoom }} />
            </div>
          </div>
          <h3 class="tpl-title">{t.emoji} {t.name}</h3>
          <p class="preview-info">
            {project && <>{project.frames.length} เฟรม · {(totalDuration(project) / 1000).toFixed(1)} วินาที · </>}
            {size === null ? 'กำลังคำนวณขนาด…' : `ไฟล์ ~${formatBytes(size)}`}
          </p>
          {visibleOptions.map((op) => (
            <label key={op.id} class="tpl-opt">
              <span>{op.label}</span>
              {op.type === 'color' && <input type="color" value={o[op.id]} onInput={(e) => setOpt(op.id, (e.target as HTMLInputElement).value)} />}
              {op.type === 'text' && <input type="text" value={o[op.id]} onInput={(e) => setOpt(op.id, (e.target as HTMLInputElement).value)} />}
              {op.type === 'choice' && (
                <select value={o[op.id]} onChange={(e) => setOpt(op.id, (e.target as HTMLSelectElement).value)}>
                  {op.choices.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              )}
            </label>
          ))}
          <label class="tpl-opt">
            <span>ความเร็ว</span>
            <select value={speed} onChange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))}>
              <option value={0.5}>ช้า (0.5×)</option>
              <option value={1}>ปกติ</option>
              <option value={1.5}>เร็ว (1.5×)</option>
              <option value={2}>เร็วมาก (2×)</option>
            </select>
          </label>
          {t.id === 'clock' && <p class="hint">เวลาเดินจริงบนบอร์ด แก้ตำแหน่ง/ขนาดได้ทีหลังในแท็บ "ใส่ของ"</p>}
        </div>
        <div class="tpl-main">
          <div class="chips">
            {CATEGORIES.map((c) => (
              <button key={c.id} class={`chip-btn${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)}>{c.label}</button>
            ))}
          </div>
          <div class="tpl-grid">
            {shown.map((x) => (
              <button key={x.id} class={`tpl-card${x.id === t.id ? ' sel' : ''}`} onClick={() => setId(x.id)} title={x.hint}>
                <div class="tpl-thumb"><Thumb t={x} presetId={presetId} tick={tick} /></div>
                <span class="name">{x.emoji} {x.name}</span>
                <small>{x.hint}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
