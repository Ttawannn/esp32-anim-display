import { getPreset } from '../model/presets';
import { store, type EditorState } from '../model/store';
import { openProjectFile } from './TopBar';

const CARDS: { emoji: string; title: string; text: string; badge?: string; run: () => void }[] = [
  { emoji: '👀', title: 'แม่แบบดวงตา', text: 'ตาแสดงอารมณ์ 12 แบบ เลือกแล้วส่งขึ้นจอได้เลย', badge: 'แนะนำ', run: () => store.set({ dialog: 'eyes' }) },
  { emoji: '✏️', title: 'วาดเอง', text: 'วาด pixel art ทีละเฟรม', run: () => store.set({ startDismissed: true }) },
  { emoji: '🎞️', title: 'นำเข้า GIF', text: 'ใช้ภาพเคลื่อนไหวที่มีอยู่แล้ว', run: () => store.set({ dialog: 'gif' }) },
  { emoji: '🎬', title: 'นำเข้าวิดีโอ', text: 'ตัดคลิปสั้นมาเล่นบนจอ', run: () => store.set({ dialog: 'video' }) },
];

// Shown over the canvas while the project is still empty.
export function StartScreen({ s }: { s: EditorState }) {
  const preset = getPreset(s.project.presetId);
  return (
    <div class="start">
      <div class="start-card">
        <h1>เริ่มสร้างแอนิเมชัน</h1>
        <p class="hint">
          สำหรับจอ <b>{preset.name}</b>{' '}
          <button class="link" onClick={() => store.set({ dialog: 'new' })}>เปลี่ยนจอ</button>
        </p>
        <div class="start-grid">
          {CARDS.map((c) => (
            <button key={c.title} class="start-option" onClick={c.run}>
              <span class="emoji">{c.emoji}</span>
              <span class="title">{c.title}{c.badge && <span class="pill">{c.badge}</span>}</span>
              <span class="text">{c.text}</span>
            </button>
          ))}
        </div>
        <button class="link" onClick={openProjectFile}>หรือเปิดโปรเจกต์ที่บันทึกไว้ (.dpe)</button>
      </div>
    </div>
  );
}

const blankCache = new WeakMap<Uint8ClampedArray, boolean>();

export function isBlankProject(s: EditorState): boolean {
  const frames = s.project.frames;
  if (frames.length !== 1) return false;
  const data = frames[0].data;
  let blank = blankCache.get(data);
  if (blank === undefined) {
    blank = true;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]) {
        blank = false;
        break;
      }
    }
    blankCache.set(data, blank);
  }
  return blank;
}
