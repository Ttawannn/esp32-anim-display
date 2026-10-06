import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getPreset } from '../model/presets';
import { newFrame, totalDuration } from '../model/project';
import { store, toast } from '../model/store';
import type { Project } from '../model/types';
import { outputFrame } from '../render/output';
import { composeScreen } from '../render/screen';
import { EYE_ANIMS, generateEyes, type EyeOptions, type EyeStyle, type GeneratedEyes } from '../templates/eyes';
import { defaultEyeOptions, eyeProject } from '../templates/eyeProject';
import { Icon, Modal, Slider } from './common';
import { t } from '../i18n';

const STYLES: { id: EyeStyle; name: string; hint: string }[] = [
  { id: 'robot', name: 'Robot', hint: 'Simple rounded squares' },
  { id: 'cartoon', name: 'Cartoon', hint: 'Whites, iris and a sparkle' },
  { id: 'single', name: 'Single eye', hint: 'One big eye, great on round screens' },
];

export function EyesDialog() {
  const current = store.state.project;
  const preset = getPreset(current.presetId);
  const mono = preset.color === 'mono';
  const [animId, setAnimId] = useState('look-lr');
  const [o, setO] = useState<EyeOptions>(() => defaultEyeOptions(preset.width, preset.height, mono, preset.round));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anim = EYE_ANIMS.find((a) => a.id === animId)!;
  const set = (patch: Partial<EyeOptions>) => setO({ ...o, ...patch });

  const gen = useMemo(() => generateEyes(preset.width, preset.height, anim, o), [animId, o, preset]);

  const toProject = (g: GeneratedEyes, name: string): Project => eyeProject(preset.id, g, o, name);

  const preview = useMemo(() => toProject(gen, t(anim.name)), [gen]);

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

  const createNew = () => finish(preview, t('Created "{name}" with {n} frames', { name: t(anim.name), n: preview.frames.length }));

  const canAppend = current.width === gen.width && current.height === gen.height && current.scale === gen.scale;
  const append = () => {
    const frames = gen.frames.map((f) => newFrame(gen.width, gen.height, f.delay, f.data));
    store.commit({ ...current, frames: [...current.frames, ...frames] }, current.frames.length);
    store.set({ dialog: null });
    toast(t('Appended "{name}": {n} frames', { name: t(anim.name), n: frames.length }));
  };

  const createAll = () => {
    const all = EYE_ANIMS.filter((a) => a.id !== 'look-around').flatMap((a) => generateEyes(preset.width, preset.height, a, o).frames);
    finish(toProject({ ...gen, frames: all }, t('All moods')), t('Created all moods: {n} frames', { n: all.length }));
  };

  const zoom = Math.max(1, Math.min(Math.floor(280 / preset.width), Math.floor(280 / preset.height)));

  return (
    <Modal title={t('Eye templates')} onClose={close}
      footer={<>
        <button class="btn" onClick={createAll} title={t('Join every mood into one animation (except Look around)')}>{t('All moods in one')}</button>
        <button class="btn" onClick={append} disabled={!canAppend}
          title={canAppend ? t('Add after the frames of the current project') : t("The image size doesn't match the current project")}>{t('Append to this project')}</button>
        <button class="btn primary" onClick={createNew}>{t('Create new project')}</button>
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
            {t(anim.name)} · {t('{n} frames', { n: gen.frames.length })} · {t('{s} s', { s: (totalDuration(preview) / 1000).toFixed(1) })} · {preset.name}
          </p>
        </div>
        <div>
          <div class="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' }}>
            {EYE_ANIMS.map((a) => (
              <button key={a.id} class={`card mood-card${a.id === animId ? ' sel' : ''}`} onClick={() => setAnimId(a.id)}>
                <Icon name={a.icon} /><span>{t(a.name)}</span>
              </button>
            ))}
          </div>
          <h4 style={{ margin: '14px 0 8px' }}>{t('Style')}</h4>
          <div class="cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {STYLES.map((s) => (
              <button key={s.id} class={`card${s.id === o.style ? ' sel' : ''}`} onClick={() => set({ style: s.id })}>
                {t(s.name)}<small>{t(s.hint)}</small>
              </button>
            ))}
          </div>
          {!mono && (
            <div class="row" style={{ marginTop: 10 }}>
              {o.style === 'robot' ? (
                <><span class="hint">{t('Eye color')}</span>
                  <input type="color" value={o.eyeColor} onInput={(e) => set({ eyeColor: (e.target as HTMLInputElement).value })} /></>
              ) : (
                <><span class="hint">{t('Iris color')}</span>
                  <input type="color" value={o.irisColor} onInput={(e) => set({ irisColor: (e.target as HTMLInputElement).value })} /></>
              )}
              <span class="hint">{t('Background')}</span>
              <input type="color" value={o.bgColor} onInput={(e) => set({ bgColor: (e.target as HTMLInputElement).value })} />
            </div>
          )}
          <Slider label={t('Eye size')} min={0.6} max={1.3} step={0.05} value={o.size} format={(v) => `${Math.round(v * 100)}%`}
            onInput={(v) => set({ size: v })} />
          {o.style !== 'single' && (
            <Slider label={t('Spacing')} min={0.4} max={1.6} step={0.05} value={o.spacing} format={(v) => `${Math.round(v * 100)}%`}
              onInput={(v) => set({ spacing: v })} />
          )}
          <div class="row">
            <span class="hint">{t('Smoothness')}</span>
            <select value={o.fps} onChange={(e) => set({ fps: Number((e.target as HTMLSelectElement).value) })}>
              {[10, 15, 20, 25, 30].map((f) => <option key={f} value={f}>{f} fps</option>)}
            </select>
            {!mono && (
              <select value={o.pixel} onChange={(e) => set({ pixel: Number((e.target as HTMLSelectElement).value) })}>
                <option value={1}>{t('Fine, smooth edges')}</option>
                <option value={2}>{t('Pixels ×2')}</option>
                <option value={4}>{t('Pixels ×4 (smallest file)')}</option>
              </select>
            )}
          </div>
          {preset.height !== preset.width && (
            <div class="row">
              <span class="hint">{t('Mounting')}</span>
              <select value={o.rotate} onChange={(e) => set({ rotate: Number((e.target as HTMLSelectElement).value) as EyeOptions['rotate'] })}>
                <option value={0}>{t('Normal')}</option>
                <option value={90}>{t('Landscape (rotate 90°)')}</option>
                <option value={270}>{t('Landscape (rotate 270°)')}</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
