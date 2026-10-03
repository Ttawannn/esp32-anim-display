import { store, toast, type EditorState } from '../model/store';
import { download, loadProjectFile, saveProjectFile } from '../storage/projectFile';
import { pickFile } from './common';

export function TopBar({ s }: { s: EditorState }) {
  const p = s.project;

  const onOpen = async () => {
    const file = await pickFile('.dpe');
    if (!file) return;
    try {
      store.load(await loadProjectFile(file));
      store.set({ zoom: 0 });
      toast(`เปิด ${file.name} แล้ว`);
    } catch (e) {
      toast((e as Error).message || 'เปิดไฟล์ไม่ได้', true);
    }
  };

  const onSave = async () => {
    download(await saveProjectFile(p), `${p.name || 'animation'}.dpe`);
  };

  return (
    <div class="topbar">
      <div class="brand">Display <span>Editor</span></div>
      <input type="text" class="name" value={p.name} title="ชื่อแอนิเมชัน"
        onChange={(e) => store.commit({ ...p, name: (e.target as HTMLInputElement).value })} />
      <button class="btn" onClick={() => store.set({ dialog: 'new' })}>ใหม่</button>
      <button class="btn" onClick={onOpen}>เปิด</button>
      <button class="btn" onClick={onSave} title="บันทึกโปรเจกต์เพื่อกลับมาแก้ภายหลัง (.dpe)">บันทึก</button>
      <div class="spacer" />
      <button class="btn" onClick={() => store.set({ dialog: 'device' })} title="ไฟล์บนบอร์ด, playlist, ตั้งค่าจอ, Wi-Fi">
        <span style={{ color: s.deviceInfo ? 'var(--ok)' : 'var(--muted)' }}>●</span> บอร์ด
      </button>
      <button class="btn" onClick={() => store.set({ dialog: 'eyes' })}>แม่แบบดวงตา</button>
      <button class="btn" onClick={() => store.set({ dialog: 'gif' })}>นำเข้า GIF</button>
      <button class="btn" onClick={() => store.set({ dialog: 'video' })}>นำเข้าวิดีโอ</button>
    </div>
  );
}
