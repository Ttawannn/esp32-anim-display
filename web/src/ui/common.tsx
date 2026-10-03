import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

const PATHS: Record<string, string> = {
  pencil: 'M4 20l4.5-1L19 8.5 15.5 5 5 15.5 4 20zM13.5 7l3.5 3.5',
  eraser: 'M8 20h11M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8z M9 11l5 5',
  line: 'M5 19L19 5',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  fill: 'M4 12l7-7 7 7-7 7zM4 12h14M20 15s1.5 2 1.5 3a1.5 1.5 0 01-3 0c0-1 1.5-3 1.5-3z',
  picker: 'M14.5 4.5l5 5M17 7l-9.5 9.5L5 19l2.5-2.5M12.5 6.5l5 5',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  mirror: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
  grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  onion: 'M6 6h10v10H6zM9 9h10v10H9z',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  zoomIn: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6M11 8v6',
  zoomOut: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  flipH: 'M12 3v18M4 7v10l5-5zM20 7v10l-5-5z',
  flipV: 'M3 12h18M7 4h10l-5 5zM7 20h10l-5-5z',
  swap: 'M7 4L4 7l3 3M4 7h12a4 4 0 014 4M17 20l3-3-3-3M20 17H8a4 4 0 01-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  filled: 'M4 6h16v12H4z',
  send: 'M4 12l16-8-6 16-3-7zM11 13l9-9',
  usb: 'M12 3v13M12 3l-2 3h4zM12 16a2 2 0 100 4 2 2 0 000-4zM12 12l-4-2V8M12 10l4-2V6M7 7h2v2H7zM15 5h2v2h-2z',
  wifi: 'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01',
  chevron: 'M6 9l6 6 6-6',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  file: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6',
  save: 'M5 3h11l5 5v11a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM7 3v6h8V3M7 21v-7h10v7',
  download: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  upload: 'M12 21V9M7 14l5-5 5 5M4 5h16',
  phone: 'M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zM11 18h2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  board: 'M6 4h12v16H6zM9 4V2M15 4V2M9 22v-2M15 22v-2M2 9h4M2 15h4M18 9h4M18 15h4M9 9h6v6H9z',
  live: 'M12 9a3 3 0 100 6 3 3 0 000-6zM6.3 6.3a8 8 0 000 11.4M17.7 6.3a8 8 0 010 11.4M3.5 3.5a12 12 0 000 17M20.5 3.5a12 12 0 010 17',
  palette: 'M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5 0-.8.7-1.5 1.5-1.5H16a5 5 0 005-5c0-4.4-4-7.5-9-7.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  check: 'M5 12l5 5L20 7',
};

export function Icon({ name, fill }: { name: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function IconButton(props: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  fill?: boolean;
}) {
  return (
    <button class={`btn icon${props.active ? ' active' : ''}`} title={props.title} aria-label={props.title}
      onClick={props.onClick} disabled={props.disabled}>
      <Icon name={props.icon} fill={props.fill} />
    </button>
  );
}

export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);
  return (
    <div class="overlay" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-label={props.title}>
        <header>
          <h2>{props.title}</h2>
          <IconButton icon="close" title="ปิด" onClick={props.onClose} />
        </header>
        <div class="body">{props.children}</div>
        {props.footer && <footer>{props.footer}</footer>}
      </div>
    </div>
  );
}

// Labeled range slider. onInput fires while dragging, onCommit once on release.
export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  onCommit?: () => void;
}) {
  return (
    <label class="field">
      <span>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value}
        onInput={(e) => props.onInput(Number((e.target as HTMLInputElement).value))}
        onChange={() => props.onCommit?.()} />
      <span class="v">{props.format ? props.format(props.value) : props.value}</span>
    </label>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
