// Gallery of generated animations: pick one, tweak colours/options, create a project (or send it
// to the board right away).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { encodeProject } from '../codec/encode';
import type { DeviceInfo } from '../device/api';
import { boardPresetId, installProject } from '../device/install';
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
import { formatBytes, Icon, Modal } from './common';
import { getLang, t } from '../i18n';

let initialTemplate = 'clock';

// Options that depend on the UI language (the clock's day/month names).
function langDefaults(tpl: AnimTemplate): Options {
  return 'names' in tpl.defaults ? { ...tpl.defaults, names: getLang() } : tpl.defaults;
}
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

function Thumb({ tpl, presetId, tick }: { tpl: AnimTemplate; presetId: string; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = `${tpl.id}|${presetId}|${getLang()}`;
  const [p, setP] = useState<Project | null>(() => thumbCache.get(key) ?? null);
  useEffect(() => {
    if (p) return;
    // Spread generation over idle time so the dialog opens instantly.
    const id = setTimeout(() => {
      try {
        const proj = templateProject(tpl, presetId, langDefaults(tpl));
        thumbCache.set(key, proj);
        setP(proj);
      } catch { /* shows the emoji instead */ }
    }, 30 + TEMPLATES.indexOf(tpl) * 25);
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
    : <span class="thumb-wait"><Icon name={tpl.icon} /></span>;
}

// `board`: install straight onto the connected board (phone remote) instead of opening a project.
export interface BoardTarget { host: string; info: DeviceInfo; onClose: () => void; onInstalled?: (name: string) => void }

export function TemplatesDialog({ board, initialId }: { board?: BoardTarget; initialId?: string } = {}) {
  const presetId = board ? boardPresetId(board.info) : store.state.project.presetId;
  const [installing, setInstalling] = useState<number | null>(null);
  const preset = getPreset(presetId);
  const mono = preset.color === 'mono';
  const [id, setId] = useState(initialId ?? initialTemplate);
  const [cat, setCat] = useState<CategoryId | 'all'>('all');
  const [opts, setOpts] = useState<Record<string, Options>>({});
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tpl = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  const o = { ...langDefaults(tpl), ...opts[tpl.id] };
  const setOpt = (k: string, v: string) => setOpts({ ...opts, [tpl.id]: { ...opts[tpl.id], [k]: v } });

  const project = useMemo(() => {
    try { return templateProject(tpl, presetId, o, speed); }
    catch (e) { toast((e as Error).message, true); return null; }
  }, [tpl, presetId, JSON.stringify(o), speed]);

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

  const close = () => (board ? board.onClose() : store.set({ dialog: null }));
  const installOnBoard = async () => {
    if (!project || !board) return;
    setInstalling(0);
    try {
      const name = await installProject(board.host, project, t(tpl.name), setInstalling);
      toast(t('Installed "{name}", now playing', { name: t(tpl.name) }));
      board.onInstalled?.(name);
      board.onClose();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setInstalling(null);
    }
  };
  const create = () => {
    if (!project) return null;
    store.load({ ...project, name: t(tpl.name) });
    store.set({ dialog: null, zoom: 0, playing: true, startDismissed: true, selectedLayer: null });
    return project;
  };
  const createOnly = () => { if (create()) toast(t('Created "{name}" with {n} frames', { name: t(tpl.name), n: project!.frames.length })); };
  const createAndSend = () => { if (create()) sendToBoard(); };

  const zoom = Math.min(260 / preset.width, 260 / preset.height);
  const shown = TEMPLATES.filter((x) => cat === 'all' || x.category === cat);
  const visibleOptions = tpl.options.filter((op) => !(mono && op.type === 'color'));

  return (
    <Modal title={t('Animation templates')} onClose={close}
      footer={board ? <>
        <span class="hint grow">{t('For the {display}', { display: preset.name })}</span>
        <button class="btn primary big" onClick={installOnBoard} disabled={!project || installing !== null}>
          {installing !== null ? t('Installing {pct}%', { pct: Math.round(installing * 100) }) : t('Install on the board and play')}
        </button>
      </> : <>
        <span class="hint grow">{t('Made to fit the {display}', { display: preset.name })}</span>
        <button class="btn" onClick={createOnly} disabled={!project}>{t('Create project')}</button>
        <button class="btn primary" onClick={createAndSend} disabled={!project}>{t('Create and send to board')}</button>
      </>}>
      <div class="tpl">
        <div class="tpl-side">
          <div class="device">
            <div class={`bezel${preset.round ? ' round' : ''}`}>
              <canvas ref={canvasRef} width={preset.width} height={preset.height}
                style={{ width: preset.width * zoom, height: preset.height * zoom }} />
            </div>
          </div>
          <h3 class="tpl-title"><Icon name={tpl.icon} /> {t(tpl.name)}</h3>
          <p class="preview-info">
            {project && <>{t('{n} frames', { n: project.frames.length })} · {t('{s} s', { s: (totalDuration(project) / 1000).toFixed(1) })} · </>}
            {size === null ? t('Estimating size…') : t('file ~{size}', { size: formatBytes(size) })}
          </p>
          {visibleOptions.map((op) => (
            <label key={op.id} class="tpl-opt">
              <span>{t(op.label)}</span>
              {op.type === 'color' && <input type="color" value={o[op.id]} onInput={(e) => setOpt(op.id, (e.target as HTMLInputElement).value)} />}
              {op.type === 'text' && <input type="text" value={o[op.id]} onInput={(e) => setOpt(op.id, (e.target as HTMLInputElement).value)} />}
              {op.type === 'choice' && (
                <select value={o[op.id]} onChange={(e) => setOpt(op.id, (e.target as HTMLSelectElement).value)}>
                  {op.choices.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
                </select>
              )}
            </label>
          ))}
          <label class="tpl-opt">
            <span>{t('Speed')}</span>
            <select value={speed} onChange={(e) => setSpeed(Number((e.target as HTMLSelectElement).value))}>
              <option value={0.5}>{t('Slow (0.5×)')}</option>
              <option value={1}>{t('Normal')}</option>
              <option value={1.5}>{t('Fast (1.5×)')}</option>
              <option value={2}>{t('Very fast (2×)')}</option>
            </select>
          </label>
          {tpl.id === 'clock' && <p class="hint">{t('The time runs live on the board.')}{board ? '' : ` ${t('Move or resize it later in the "Insert" tab.')}`}</p>}
        </div>
        <div class="tpl-main">
          <div class="chips">
            {CATEGORIES.map((c) => (
              <button key={c.id} class={`chip-btn${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)}>{t(c.label)}</button>
            ))}
          </div>
          <div class="tpl-grid">
            {shown.map((x) => (
              <button key={x.id} class={`tpl-card${x.id === tpl.id ? ' sel' : ''}`} onClick={() => setId(x.id)} title={t(x.hint)}>
                <div class="tpl-thumb"><Thumb tpl={x} presetId={presetId} tick={tick} /></div>
                <span class="name"><Icon name={x.icon} /> {t(x.name)}</span>
                <small>{t(x.hint)}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
