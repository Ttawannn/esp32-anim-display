// Phone remote sections: send a message to the screen, one-tap templates, board settings.

import { useState } from 'preact/hooks';
import type { DeviceInfo } from '../device/api';
import { boardPresetId, installProject, messageFile, messageProject } from '../device/install';
import { toast } from '../model/store';
import { TEMPLATES } from '../templates/gallery';
import { BoardName, DisplayTab, WifiTab } from './BoardSettings';
import { Icon, Modal } from './common';
import { openSetupWizard } from './SetupWizard';
import { TemplatesDialog } from './TemplatesDialog';
import { t } from '../i18n';

const MESSAGE_COLORS = ['#ffffff', '#ffd23f', '#ff5a5f', '#4fd1ff', '#7cff6b', '#ff8ad8'];

export function MessageCard({ host, info, onSent }: { host: string; info: DeviceInfo; onSent: () => void }) {
  const [text, setText] = useState('');
  const [scroll, setScroll] = useState(true);
  const [color, setColor] = useState(MESSAGE_COLORS[1]);
  const [sending, setSending] = useState<number | null>(null);
  const mono = info.display.color === 'mono';

  const send = async () => {
    if (!text.trim()) return;
    setSending(0);
    try {
      const p = messageProject(boardPresetId(info), { text: text.trim(), scroll, color, bg: '#000000' });
      await installProject(host, p, messageFile(), setSending);
      toast(t('Message sent to the screen'));
      onSent();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSending(null);
    }
  };

  return (
    <section class="card message">
      <h3><Icon name="text" /> {t('Send a message')}</h3>
      <textarea rows={2} maxLength={200} placeholder={t('Type a message, e.g. Happy birthday!')} value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class="seg two">
        <button class={scroll ? 'active' : ''} onClick={() => setScroll(true)}>{t('Scrolling')}</button>
        <button class={!scroll ? 'active' : ''} onClick={() => setScroll(false)}>{t('Still')}</button>
      </div>
      {!mono && (
        <div class="color-dots" role="radiogroup" aria-label={t('Text color')}>
          {MESSAGE_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={c === color} class={c === color ? 'sel' : ''} style={{ background: c }}
              onClick={() => setColor(c)} title={c} />
          ))}
        </div>
      )}
      <button class="btn primary big wide" disabled={!text.trim() || sending !== null} onClick={send}>
        {sending !== null ? t('Sending {pct}%', { pct: Math.round(sending * 100) }) : <><Icon name="send" /> {t('Show on screen')}</>}
      </button>
      <p class="hint">{t('A new message replaces the previous one ({file})', { file: messageFile() })}</p>
    </section>
  );
}

export function TemplatesSection({ host, info, onInstalled }: { host: string; info: DeviceInfo; onInstalled: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section class="card">
      <h3><Icon name="wand" /> {t('Animation templates')}</h3>
      <p class="hint">{t('Tap to preview, adjust the colors, then install on the board')}</p>
      <div class="tpl-chips">
        {TEMPLATES.map((tpl) => (
          <button key={tpl.id} class="tpl-chip" onClick={() => setOpen(tpl.id)}>
            <span class="ico"><Icon name={tpl.icon} /></span>{t(tpl.name)}
          </button>
        ))}
      </div>
      {open && (
        <TemplatesDialog initialId={open} board={{ host, info, onClose: () => setOpen(null), onInstalled }} />
      )}
    </section>
  );
}

type SettingsTab = 'display' | 'wifi' | 'name';

export function BoardSettingsSheet({ host, info, onClose }: { host: string; info: DeviceInfo; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('display');
  return (
    <Modal title={t('Board settings')} onClose={onClose}>
      <p class="hint">{info.board_name} · {t('firmware')} {info.version} · {t('display')} {info.display.name}</p>
      <div class="seg three">
        {([['display', 'Display'], ['wifi', 'Wi-Fi'], ['name', 'Board name']] as [SettingsTab, string][]).map(([id, label]) => (
          <button key={id} class={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{t(label)}</button>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {tab === 'display' && <DisplayTab host={host} />}
        {tab === 'wifi' && <WifiTab host={host} />}
        {tab === 'name' && <BoardName host={host} />}
      </div>
      <button class="btn wide" style={{ marginTop: 16 }} onClick={() => { onClose(); openSetupWizard(); }}>
        <Icon name="sparkle" /> {t('Re-run setup')}
      </button>
    </Modal>
  );
}
