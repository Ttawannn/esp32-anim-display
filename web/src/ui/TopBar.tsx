import { useState } from 'preact/hooks';
import { encodeProject } from '../codec/encode';
import { deviceFileName } from '../device/api';
import { firmwareInstallerUrl, sendToBoard } from '../device/send';
import { store, toast, type EditorState } from '../model/store';
import { download, loadProjectFile, saveProjectFile } from '../storage/projectFile';
import { Icon, IconButton, pickFile } from './common';
import { ConnectionChip } from './ConnectionChip';
import { Menu, MenuItem, MenuSeparator } from './Menu';
import { openTemplates } from './TemplatesDialog';

export async function openProjectFile() {
  const file = await pickFile('.dpe');
  if (!file) return;
  try {
    store.load(await loadProjectFile(file));
    store.set({ zoom: 0, startDismissed: true });
    toast(`เปิด ${file.name} แล้ว`);
  } catch (e) {
    toast((e as Error).message || 'เปิดไฟล์ไม่ได้', true);
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
      <input type="text" class="name" value={p.name} title="ชื่อแอนิเมชัน (ใช้เป็นชื่อไฟล์บนบอร์ด)" aria-label="ชื่อแอนิเมชัน"
        onChange={(e) => store.commit({ ...p, name: (e.target as HTMLInputElement).value })} />

      <Menu label="ไฟล์" icon="file" open={menu === 'file'} onToggle={toggle('file')}>
        <MenuItem icon="plus" label="โปรเจกต์ใหม่" hint="เลือกจอและขนาดภาพ" onClick={() => open('new')} />
        <MenuItem icon="folder" label="เปิดโปรเจกต์…" hint="ไฟล์ .dpe" onClick={openProjectFile} />
        <MenuItem icon="save" label="บันทึกโปรเจกต์" hint="เก็บไว้แก้ต่อ (.dpe)" onClick={saveProject} />
        <MenuSeparator />
        <MenuItem icon="download" label="ดาวน์โหลด .dpa" hint="ไฟล์สำหรับเล่นบนบอร์ด" onClick={downloadDpa} />
        <MenuSeparator />
        <MenuItem icon="board" label="ติดตั้งเฟิร์มแวร์ลงบอร์ด" hint="แฟลชผ่าน USB จากเบราว์เซอร์"
          onClick={() => window.open(firmwareInstallerUrl(), '_blank', 'noopener')} />
      </Menu>
      <Menu label="สร้าง" icon="sparkle" open={menu === 'create'} onToggle={toggle('create')}>
        <MenuItem icon="wand" label="แม่แบบแอนิเมชัน" hint="ไฟ ฝน ดาว พลุ นาฬิกา และอีก 20+ แบบ" onClick={() => openTemplates()} />
        <MenuItem icon="sparkle" label="แม่แบบดวงตา" hint="12 อารมณ์ พร้อมใช้" onClick={() => open('eyes')} />
        <MenuItem icon="clock" label="นาฬิกาดิจิทัล" hint="เวลาเดินจริงบนบอร์ด" onClick={() => openTemplates('clock')} />
        <MenuItem icon="image" label="นำเข้า GIF" hint="ภาพเคลื่อนไหวสำเร็จรูป" onClick={() => open('gif')} />
        <MenuItem icon="film" label="นำเข้าวิดีโอ" hint="MP4, WebM, MOV" onClick={() => open('video')} />
      </Menu>
      <span class="tb-sep" />
      <IconButton icon="undo" title="ย้อนกลับ (Ctrl+Z)" disabled={!store.canUndo} onClick={() => store.undo()} />
      <IconButton icon="redo" title="ทำซ้ำ (Ctrl+Y)" disabled={!store.canRedo} onClick={() => store.redo()} />

      <div class="spacer" />

      <a class="btn ghost" href="#/remote" title="หน้ารีโมท: แตะเลือกหน้าที่จะแสดงบนจอ (เหมาะกับมือถือ)">
        <Icon name="phone" /><span class="lbl">รีโมท</span>
      </a>
      <ConnectionChip />
      <button class={`btn primary send${s.sending ? ' busy' : ''}`} onClick={sendToBoard} disabled={!!s.sending}
        title="บันทึกแอนิเมชันนี้ลงบอร์ดและเล่นทันที">
        {s.sending && <span class="send-progress" style={{ width: `${Math.round(s.sending.pct * 100)}%` }} />}
        <Icon name="send" />
        <span class="lbl">{s.sending ? `${s.sending.label} ${Math.round(s.sending.pct * 100)}%` : 'ส่งไปบอร์ด'}</span>
      </button>
    </header>
  );
}
