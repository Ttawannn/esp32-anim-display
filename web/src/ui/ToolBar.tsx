import { flipH, flipV, type Tool } from '../editor/tools';
import { setFrameData, store, type EditorState } from '../model/store';
import { IconButton } from './common';

export const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'pencil', icon: 'pencil', label: 'ดินสอ', key: 'B' },
  { id: 'eraser', icon: 'eraser', label: 'ยางลบ', key: 'E' },
  { id: 'line', icon: 'line', label: 'เส้นตรง', key: 'L' },
  { id: 'rect', icon: 'rect', label: 'สี่เหลี่ยม', key: 'R' },
  { id: 'ellipse', icon: 'ellipse', label: 'วงรี', key: 'O' },
  { id: 'fill', icon: 'fill', label: 'เทสี', key: 'G' },
  { id: 'picker', icon: 'picker', label: 'ดูดสี', key: 'I' },
  { id: 'move', icon: 'move', label: 'เลื่อนภาพ', key: 'M' },
];

export function ToolBar({ s }: { s: EditorState }) {
  const { project: p, frameIndex } = s;
  const frame = p.frames[frameIndex];
  return (
    <div class="tools">
      {TOOLS.map((t) => (
        <IconButton key={t.id} icon={t.icon} title={`${t.label} (${t.key})`} active={s.tool === t.id}
          onClick={() => store.set({ tool: t.id })} />
      ))}
      <div class="sep" />
      <button class="btn icon" title="ขนาดหัวแปรง (1-3)" onClick={() => store.set({ brush: (s.brush % 3) + 1 })}>
        {s.brush}px
      </button>
      <IconButton icon="filled" fill={s.filled} title="รูปทรงแบบทึบ" active={s.filled}
        onClick={() => store.set({ filled: !s.filled })} />
      <IconButton icon="mirror" title="วาดสมมาตรซ้าย-ขวา" active={s.mirror}
        onClick={() => store.set({ mirror: !s.mirror })} />
      <div class="sep" />
      <IconButton icon="flipH" title="กลับภาพซ้าย-ขวา (เฟรมนี้)"
        onClick={() => setFrameData(frameIndex, flipH(frame.data, p.width, p.height))} />
      <IconButton icon="flipV" title="กลับภาพบน-ล่าง (เฟรมนี้)"
        onClick={() => setFrameData(frameIndex, flipV(frame.data, p.width, p.height))} />
      <div class="sep" />
      <IconButton icon="grid" title="เส้นตาราง" active={s.grid} onClick={() => store.set({ grid: !s.grid })} />
      <IconButton icon="onion" title="Onion skin (เห็นเฟรมก่อนหน้าจาง ๆ)" active={s.onion}
        onClick={() => store.set({ onion: !s.onion })} />
    </div>
  );
}
