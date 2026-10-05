import { flipH, flipV, type Tool } from '../editor/tools';
import { setFrameData, store, type EditorState } from '../model/store';
import { IconButton } from './common';
import { t } from '../i18n';

export const TOOLS: { id: Tool; icon: string; label: string; key: string }[] = [
  { id: 'select', icon: 'cursor', label: 'Select / move objects', key: 'V' },
  { id: 'pencil', icon: 'pencil', label: 'Pencil', key: 'B' },
  { id: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'line', icon: 'line', label: 'Line', key: 'L' },
  { id: 'rect', icon: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'fill', icon: 'fill', label: 'Fill', key: 'G' },
  { id: 'picker', icon: 'picker', label: 'Color picker', key: 'I' },
  { id: 'move', icon: 'move', label: 'Move image', key: 'M' },
];

export function ToolBar({ s }: { s: EditorState }) {
  const { project: p, frameIndex } = s;
  const frame = p.frames[frameIndex];
  return (
    <div class="tools">
      {TOOLS.map((tool) => (
        <IconButton key={tool.id} icon={tool.icon} title={`${t(tool.label)} (${tool.key})`} active={s.tool === tool.id}
          onClick={() => store.set({ tool: tool.id })} />
      ))}
      <div class="sep" />
      <button class="btn icon" title={t('Brush size (1-3)')} onClick={() => store.set({ brush: (s.brush % 3) + 1 })}>
        {s.brush}px
      </button>
      <IconButton icon="filled" fill={s.filled} title={t('Filled shapes')} active={s.filled}
        onClick={() => store.set({ filled: !s.filled })} />
      <IconButton icon="mirror" title={t('Mirror drawing left-right')} active={s.mirror}
        onClick={() => store.set({ mirror: !s.mirror })} />
      <div class="sep" />
      <IconButton icon="flipH" title={t('Flip horizontally (this frame)')}
        onClick={() => setFrameData(frameIndex, flipH(frame.data, p.width, p.height))} />
      <IconButton icon="flipV" title={t('Flip vertically (this frame)')}
        onClick={() => setFrameData(frameIndex, flipV(frame.data, p.width, p.height))} />
      <div class="sep" />
      <IconButton icon="grid" title={t('Grid')} active={s.grid} onClick={() => store.set({ grid: !s.grid })} />
      <IconButton icon="onion" title={t('Onion skin (faint previous frame)')} active={s.onion}
        onClick={() => store.set({ onion: !s.onion })} />
    </div>
  );
}
