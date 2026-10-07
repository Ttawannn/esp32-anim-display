import { useState } from 'preact/hooks';
import { encodeProject } from '../codec/encode';
import { deviceFileName } from '../device/api';
import { firmwareInstallerUrl, sendToBoard } from '../device/send';
import { store, toast, type EditorState } from '../model/store';
import { download, loadProjectFile, saveProjectFile } from '../storage/projectFile';
import { Icon, IconButton, pickFile } from './common';
import { ConnectionChip } from './ConnectionChip';
import { LangSwitch } from './LangSwitch';
import { Menu, MenuItem, MenuSeparator } from './Menu';
import { openTemplates } from './TemplatesDialog';
import { TEMPLATES } from '../templates/gallery';
import { t } from '../i18n';

export async function openProjectFile() {
  const file = await pickFile('.dpe');
  if (!file) return;
  try {
    store.load(await loadProjectFile(file));
    store.set({ zoom: 0, startDismissed: true });
    toast(t('Opened {name}', { name: file.name }));
  } catch (e) {
    toast((e as Error).message || t("Couldn't open the file"), true);
  }
}

export function TopBar({ s }: { s: EditorState }) {
  const p = s.project;
  const [menu, setMenu] = useState<null | 'file' | 'create'>(null);
  const toggle = (m: 'file' | 'create') => (open: boolean) => setMenu(open ? m : null);

  const saveProject = async () => download(await saveProjectFile(p), `${p.name || 'animation'}.dpe`);
  const downloadDpa = async () => {
    try {
      const r = await encodeProject(p);
      download(r.bytes, `${deviceFileName(p.name)}.dpa`);
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  const open = (dialog: EditorState['dialog']) => store.set({ dialog });

  return (
    <header class="topbar">
      <div class="brand" title="Display Editor">
        <span class="logo"><i /><i /></span>
        <span class="lbl">Display <b>Editor</b></span>
      </div>
      <input type="text" class="name" value={p.name} title={t('Animation name (used as the file name on the board)')} aria-label={t('Animation name')}
        onChange={(e) => store.commit({ ...p, name: (e.target as HTMLInputElement).value })} />

      <Menu label={t('File')} icon="file" open={menu === 'file'} onToggle={toggle('file')}>
        <MenuItem icon="plus" label={t('New project')} hint={t('Choose the display and image size')} onClick={() => open('new')} />
        <MenuItem icon="folder" label={t('Open project…')} hint={t('.dpe file')} onClick={openProjectFile} />
        <MenuItem icon="save" label={t('Save project')} hint={t('Keep it to edit later (.dpe)')} onClick={saveProject} />
        <MenuSeparator />
        <MenuItem icon="download" label={t('Download .dpa')} hint={t('The file the board plays')} onClick={downloadDpa} />
      </Menu>
      <Menu label={t('Create')} icon="sparkle" open={menu === 'create'} onToggle={toggle('create')}>
        <MenuItem icon="wand" label={t('Templates')} hint={t('Eyes, clocks and {n} animations in one place', { n: TEMPLATES.length })} onClick={() => openTemplates()} />
        <MenuItem icon="eye" label={t('Eyes')} hint={t('12 moods in 3 styles')} onClick={() => openTemplates(undefined, 'eyes')} />
        <MenuItem icon="clock" label={t('Clock & text')} hint={t('Live time, date and scrolling text')} onClick={() => openTemplates('clock', 'text')} />
        <MenuSeparator />
        <MenuItem icon="image" label={t('Import GIF')} hint={t('Use a ready-made animation')} onClick={() => open('gif')} />
        <MenuItem icon="film" label={t('Import video')} hint="MP4, WebM, MOV" onClick={() => open('video')} />
      </Menu>
      <button class="btn ghost" title={t('Which display pin goes to which board pin')} onClick={() => open('wiring')}>
        <Icon name="cable" /><span class="lbl">{t('Wiring')}</span>
      </button>
      <a class="btn ghost" href={firmwareInstallerUrl()} target="_blank" rel="noopener" title={t('Flash over USB from the browser')}>
        <Icon name="board" /><span class="lbl">{t('Install firmware')}</span>
      </a>
      <span class="tb-sep" />
      <IconButton icon="undo" title={t('Undo (Ctrl+Z)')} disabled={!store.canUndo} onClick={() => store.undo()} />
      <IconButton icon="redo" title={t('Redo (Ctrl+Y)')} disabled={!store.canRedo} onClick={() => store.redo()} />

      <div class="spacer" />

      <LangSwitch />
      <a class="btn ghost" href="#/remote" title={t('Remote: tap what to show on the screen (made for phones)')}>
        <Icon name="phone" /><span class="lbl">{t('Remote')}</span>
      </a>
      <ConnectionChip />
      <button class={`btn primary send${s.sending ? ' busy' : ''}`} onClick={sendToBoard} disabled={!!s.sending}
        title={t('Save this animation on the board and play it now')}>
        {s.sending && <span class="send-progress" style={{ width: `${Math.round(s.sending.pct * 100)}%` }} />}
        <Icon name="send" />
        <span class="lbl">{s.sending ? `${s.sending.label} ${Math.round(s.sending.pct * 100)}%` : t('Send to board')}</span>
      </button>
    </header>
  );
}
