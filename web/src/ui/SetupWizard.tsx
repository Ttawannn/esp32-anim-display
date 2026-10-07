// First-run setup on a new board: display (with a test pattern to compare against) → name →
// first animations → home Wi-Fi. Opens by itself while the board reports display.configured=false,
// and from "Re-run setup" at any time.

import { useEffect, useRef, useState } from 'preact/hooks';
import { device, type DevicePreset, type DisplaySettings } from '../device/api';
import { boardPresetId, installTemplate } from '../device/install';
import { refreshDevice } from '../device/session';
import { toast, useEditor } from '../model/store';
import { testPatternImage } from '../render/testPattern';
import { defaultEyeOptions, installMoodSet } from '../templates/eyeProject';
import { BoardName, run, waitForReboot, WifiTab } from './BoardSettings';
import { Icon, Modal } from './common';
import { frameFactor, ModuleFrame } from './ModuleFrame';
import { WiringGuide } from './WiringGuide';
import { boardSpec, pinConflicts, rememberedPins, samePins, type Pins } from '../device/boards';
import { withRotation } from '../model/presets';
import { getLang, t } from '../i18n';

type Step = 'display' | 'wire' | 'check' | 'name' | 'content' | 'wifi' | 'done';
const STEPS: [Step, string][] = [['display', 'Display'], ['wire', 'Wiring'], ['check', 'Check'], ['name', 'Name'], ['content', 'Animation'], ['wifi', 'Wi-Fi']];

let dismissed = false;

// Mount once per page: opens the wizard automatically for an unconfigured board.
export function SetupWizardAuto() {
  const s = useEditor();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!dismissed && s.deviceInfo?.display.configured === false) setOpen(true);
  }, [s.deviceInfo?.display.configured]);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('open-setup', onOpen);
    return () => window.removeEventListener('open-setup', onOpen);
  }, []);
  if (!open || !s.deviceInfo) return null;
  return <SetupWizard onClose={() => { dismissed = true; setOpen(false); }} />;
}

export function openSetupWizard() {
  window.dispatchEvent(new Event('open-setup'));
}

// The test pattern as the board draws it at its own rotation, inside the real-looking module.
function PatternPreview({ preset, rotation }: { preset: DevicePreset; rotation: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const odd = rotation & 1;
  const w = odd ? preset.height : preset.width, h = odd ? preset.width : preset.height;
  useEffect(() => {
    ref.current!.getContext('2d')!.putImageData(testPatternImage(w, h, preset.round, preset.color === 'mono'), 0, 0);
  }, [preset.id, rotation]);
  const id = withRotation(preset.id, rotation);
  const { fx, fy } = frameFactor(id);
  const zoom = Math.min(240 / (w * fx), 220 / (h * fy));
  return (
    <div class="device">
      <ModuleFrame presetId={id} screenW={w * zoom} screenH={h * zoom}>
        <canvas ref={ref} width={w} height={h} style={{ width: w * zoom, height: h * zoom }} />
      </ModuleFrame>
    </div>
  );
}

function presetIcon(p: DevicePreset) {
  return p.round ? 'displayRound' : p.color === 'mono' ? 'displayWide' : p.width === p.height ? 'displaySquare' : 'displayTall';
}

export function SetupWizard({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const info = s.deviceInfo;
  const host = s.deviceHost;
  const [step, setStep] = useState<Step>('display');
  const [presets, setPresets] = useState<DevicePreset[]>([]);
  const [choice, setChoice] = useState(info?.display.preset ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [blank, setBlank] = useState(false);
  const [pins, setPins] = useState<Pins | null>(null); // wiring as saved on the board
  const [wiring, setWiring] = useState<Pins | null>(null); // wiring being edited

  useEffect(() => { device.presets(host).then(setPresets, () => {}); }, [host]);
  useEffect(() => {
    const fallback = boardSpec(info?.board).defaults;
    // A board never set up starts from the pins picked in the Wiring dialog before it was connected.
    const planned = info?.display.configured === false ? rememberedPins(info.board) : null;
    device.display(host).then((d) => { setPins(d.pins); setWiring(planned ?? d.pins); }, () => { setPins(fallback); setWiring(planned ?? fallback); });
  }, [host]);
  // Show the test pattern whenever the check step is (re)entered.
  useEffect(() => {
    if (step === 'check') device.testPattern(host).catch(() => {});
  }, [step]);

  if (!info) return null;
  const detected = info.display.detected;
  const current = presets.find((p) => p.id === info.display.preset);
  const mono = current?.color === 'mono';
  const ordered = [...presets].sort((a, b) => {
    const rank = (p: DevicePreset) => (detected === 'oled' ? (p.color === 'mono' ? 0 : 1) : detected === 'tft' ? (p.color === 'mono' ? 1 : 0) : 0);
    return rank(a) - rank(b);
  });

  // Save display settings, wait for the reboot, then show the test pattern again.
  const apply = async (label: string, patch: Partial<DisplaySettings>) => {
    setBusy(label);
    try {
      if (!(await run(() => device.saveDisplay(host, patch)))) return false;
      await waitForReboot();
      await refreshDevice().catch(() => {});
      await device.testPattern(host).catch(() => {});
      return true;
    } finally {
      setBusy(null);
    }
  };
  const fix = async (label: string, change: (d: DisplaySettings) => Partial<DisplaySettings>) => {
    const d = await device.display(host).catch((e) => { toast((e as Error).message, true); return null; });
    if (d) await apply(label, change(d));
  };

  const chosen = presets.find((p) => p.id === choice);
  const useDisplay = async () => {
    const pinsChanged = !!wiring && !!pins && !samePins(wiring, pins);
    if (choice !== info.display.preset || !info.display.configured || pinsChanged) {
      if (!(await apply(t('Setting up the display'), { preset: choice, ...(pinsChanged ? { pins: wiring! } : {}) }))) return;
      if (pinsChanged) setPins(wiring);
    }
    setBlank(false);
    setStep('check');
  };

  const install = async (what: 'eyes' | 'clock') => {
    setBusy(what === 'eyes' ? t('Installing the eye set') : t('Installing the clock'));
    try {
      if (what === 'eyes') {
        const d = info.display;
        const o = defaultEyeOptions(d.color === 'mono', d.shape === 'round');
        const names = await installMoodSet(host, boardPresetId(info), d, o, (done, total) => setBusy(t('Installing the eye set {n}/{total}', { n: done + 1, total })));
        await device.play(host, names[0]);
      } else {
        await installTemplate(host, info, 'clock', { names: getLang() });
      }
      toast(t('Installed, now playing on the screen'));
      setStep('wifi');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const stepIndex = STEPS.findIndex(([id]) => id === step);

  return (
    <Modal title={t('Set up your board')} onClose={onClose}>
      <div class="wizard">
        {step !== 'done' && (
          <ol class="wiz-steps">
            {STEPS.map(([id, label], i) => <li key={id} class={i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}>{t(label)}</li>)}
          </ol>
        )}
        {busy && <div class="wiz-busy"><span class="spinner" /> {busy}… <small>{t('The board may restart and disappear for a moment')}</small></div>}

        {step === 'display' && (
          <>
            <h3>{t('Which display is connected?')}</h3>
            <p class="hint">
              {detected === 'oled' ? t('An OLED display was detected on the I2C pins. Pick the matching size.')
                : detected === 'tft' ? t('No OLED found, so it is probably a color TFT. Pick the matching model.')
                : t('Pick the model of the connected display.')}
            </p>
            <div class="wiz-presets">
              {ordered.map((p) => (
                <button key={p.id} class={`wiz-preset${choice === p.id ? ' sel' : ''}${detected && (detected === 'oled') !== (p.color === 'mono') ? ' dim' : ''}`}
                  onClick={() => setChoice(p.id)}>
                  <span class="ico"><Icon name={presetIcon(p)} /></span>
                  <span><b>{p.name}</b><small>{p.width}×{p.height} · {p.color === 'mono' ? t('mono') : t('color')}{p.round ? ` · ${t('round')}` : ''}</small></span>
                </button>
              ))}
            </div>
            <div class="wiz-actions">
              <button class="btn ghost" onClick={onClose}>{t('Later')}</button>
              <button class="btn primary" disabled={!choice || !!busy} onClick={() => setStep('wire')}>{t('Use this display')} <Icon name="right" /></button>
            </div>
          </>
        )}

        {step === 'wire' && chosen && wiring && (
          <>
            <h3>{t('Connect the display like this')}</h3>
            <p class="hint">{t('Match the colors: each pin on the display goes to the board pin in the same row. Unplug USB while wiring. The default pins work for most people; change a pin only if it is already used.')}</p>
            <WiringGuide preset={chosen} board={info.board} pins={wiring} onChange={setWiring} />
            <div class="wiz-actions">
              <button class="btn ghost" onClick={() => setStep('display')}>{t('Back')}</button>
              <button class="btn primary" disabled={!!busy || pinConflicts(wiring, chosen.color === 'mono').size > 0} onClick={useDisplay}>
                {t('Wired, show the test pattern')} <Icon name="right" />
              </button>
            </div>
          </>
        )}

        {step === 'check' && current && (
          <>
            <h3>{t('Does your screen look like this?')}</h3>
            <PatternPreview preset={current} rotation={info.display.rotation ?? 0} />
            <p class="hint center">
              {current.round ? t('Red at the top, green right, blue left, a yellow circle around the edge.')
                : mono ? t('A full border, squares in the top-left, top-right and bottom-left corners, and a checkerboard at the bottom right.')
                : t('A white border, red top-left, green top-right, blue bottom-left, and 8 color bars.')}
              {' '}{t('(The real screen also shows the model name as text.)')}
            </p>
            <button class="btn primary big wide" disabled={!!busy} onClick={() => setStep('name')}><Icon name="check" /> {t('Yes, it looks right')}</button>
            <p class="hint" style={{ margin: '14px 0 6px' }}>{t('Not right? Pick what you see:')}</p>
            <div class="wiz-fixes">
              <button class="btn" disabled={!!busy} onClick={() => setBlank(true)}>{t('Black screen / nothing shows')}</button>
              <button class="btn" disabled={!!busy} onClick={() => fix(t('Inverting colors'), (d) => ({ invert: !d.invert }))}>{t('Colors inverted (black is white)')}</button>
              {!mono && <button class="btn" disabled={!!busy} onClick={() => fix(t('Swapping red/blue'), (d) => ({ bgr: !d.bgr }))}>{t('Red and blue are swapped')}</button>}
              <button class="btn" disabled={!!busy} onClick={() => fix(t('Rotating'), (d) => ({ rotation: (d.rotation + (mono ? 2 : 1)) % 4 }))}>{t('Rotated / upside down')}</button>
              {!mono && <button class="btn" disabled={!!busy} onClick={() => fix(t('Mirroring'), (d) => ({ mirror_x: !d.mirror_x }))}>{t('Mirrored left-right')}</button>}
              {current.id.startsWith('st7735s_80x160') && (
                <button class="btn" disabled={!!busy} onClick={() => apply(t('Trying the other variant'), { preset: current.id === 'st7735s_80x160' ? 'st7735s_80x160_b' : 'st7735s_80x160' })}>
                  {t('Shifted / garbage at the edge')}
                </button>
              )}
              {current.id === 'ssd1306_128x64' && (
                <button class="btn" disabled={!!busy} onClick={() => apply(t('Trying SH1106'), { preset: 'sh1106_128x64' })}>{t('Shifted / garbage lines at the side')}</button>
              )}
            </div>
            {blank && (
              <div class="callout warn">
                <span>{t('Check the wiring first, wire by wire. If the wiring is right, try another display model.')}</span>
                <button class="btn small" onClick={() => setStep('wire')}>{t('Check the wiring')}</button>
                <button class="btn small" onClick={() => setStep('display')}>{t('Pick another model')}</button>
              </div>
            )}
          </>
        )}

        {step === 'name' && (
          <>
            <h3>{t('Name your board')}</h3>
            <p class="hint">{t('Tells your boards apart. An English name also becomes the web address, e.g. desk-eyes.local')}</p>
            <BoardName host={host} />
            <div class="wiz-actions">
              <button class="btn ghost" onClick={() => setStep('check')}>{t('Back')}</button>
              <button class="btn primary" onClick={() => setStep('content')}>{t('Next')} <Icon name="right" /></button>
            </div>
          </>
        )}

        {step === 'content' && (
          <>
            <h3>{t('What should the screen play first?')}</h3>
            <div class="wiz-content">
              <button class="start-option" disabled={!!busy} onClick={() => install('eyes')}>
                <span class="start-ico"><Icon name="eye" /></span><span class="title">{t('12 eye moods')}</span><span class="text">{t('Looking around, happy, sad, angry and more')}</span>
              </button>
              <button class="start-option" disabled={!!busy} onClick={() => install('clock')}>
                <span class="start-ico"><Icon name="clock" /></span><span class="title">{t('Digital clock')}</span><span class="text">{t('Live time and date on the screen')}</span>
              </button>
            </div>
            <div class="wiz-actions">
              <button class="btn ghost" onClick={() => setStep('name')}>{t('Back')}</button>
              <button class="btn" onClick={() => setStep('wifi')}>{t('Skip')}</button>
            </div>
          </>
        )}

        {step === 'wifi' && (
          <>
            <h3>{t('Join your home Wi-Fi (optional)')}</h3>
            <p class="hint">
              {t('The board then gets the time from the internet, and any phone or computer at home can open it at')}
              {' '}<b>http://{info.wifi.hostname}</b> · {t("Or skip this and keep using the board's own Wi-Fi ({ssid}).", { ssid: info.wifi.mode === 'ap' ? info.wifi.ssid : 'DisplayEditor-XXXX' })}
            </p>
            <WifiTab host={host} />
            <div class="wiz-actions">
              <button class="btn primary" onClick={() => setStep('done')}>{t('Skip / done')}</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div class="wiz-done">
            <span class="done-ico"><Icon name="checkCircle" /></span>
            <h3>{t('All set!')}</h3>
            <p class="hint">{t('From the main page you can tap an animation to show it, install more templates, or send a message to the screen.')}</p>
            <button class="btn primary big wide" onClick={onClose}>{t('Start')}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
