import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { t } from '../i18n';

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
  cable: 'M7 3v5M11 3v5M5 8h8v3a4 4 0 01-8 0zM9 15v2a4 4 0 004 4h2a4 4 0 004-4V7',
  usb: 'M12 3v13M12 3l-2 3h4zM12 16a2 2 0 100 4 2 2 0 000-4zM12 12l-4-2V8M12 10l4-2V6M7 7h2v2H7zM15 5h2v2h-2z',
  wifi: 'M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01',
  chevron: 'M6 9l6 6 6-6',
  up: 'M5 15l7-7 7 7',
  arrowUp: 'M12 20V4M5 11l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
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
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  heart: 'M12 20s-7.4-4.5-9.1-9.2C1.7 7.4 4 4 7.3 4c2 0 3.6 1.1 4.7 2.8C13.1 5.1 14.7 4 16.7 4c3.3 0 5.6 3.4 4.4 6.8C19.4 15.5 12 20 12 20z',
  flame: 'M12 3c.6 3.2 5 5.2 5 10a5 5 0 01-10 0c0-2.4 1.3-3.9 2.4-4.8.2 1.8 1 2.8 2.1 3.3C11 8.7 11.2 5.6 12 3z',
  cloudRain: 'M7.5 15.5A4 4 0 017 7.6a5.5 5.5 0 0110.6 1.2 3.5 3.5 0 01-.6 6.7M8.5 18.5l-1 2M12.5 17.5l-1.5 3.5M16.5 18.5l-1 2',
  snowflake: 'M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2M3.5 10.2l3.1-.4-1.2-2.9M20.5 13.8l-3.1.4 1.2 2.9M5.4 17.1l1.2-2.9-3.1-.4M18.6 6.9l-1.2 2.9 3.1.4',
  stars: 'M10 3l1.6 4.6L16 9l-4.4 1.4L10 15l-1.6-4.6L4 9l4.4-1.4zM18 13l.8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8zM18.5 3.5h.01',
  rocket: 'M14.5 4.5c2.3-1.2 4.8-1.5 5.5-1 .5.7.2 3.2-1 5.5-1.4 2.6-4 5-7 6.5L8.5 12c1.5-3 3.9-5.6 6-7.5zM8.5 12l-3 .5-2 2 4 1M12 15.5l-.5 3-2 2-1-4M15 9a1 1 0 100-2 1 1 0 000 2zM5 19c.5-1.5 1.5-2.5 3-3',
  code: 'M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14',
  equalizer: 'M4 20v-5M8 20V9M12 20V5M16 20v-8M20 20v-4',
  rainbow: 'M3 17a9 9 0 0118 0M6.5 17a5.5 5.5 0 0111 0M10 17a2 2 0 014 0',
  ball: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 6.6c2.8 2.1 3.3 7.6 1 11.3M18.4 6.6c-2.8 2.1-3.3 7.6-1 11.3',
  pacman: 'M20.2 7.8A9 9 0 1020.2 16.2L12 12zM12 7.5h.01',
  battery: 'M4 7h13a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0117 17H4a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 014 7zM21.5 10.5v3M11 9.5l-2 2.5h3l-2 2.5',
  waves: 'M2 7.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 12.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5M2 17.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5',
  fireworks: 'M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5M5.3 5.3l2.5 2.5M16.2 16.2l2.5 2.5M5.3 18.7l2.5-2.5M16.2 7.8l2.5-2.5M12 10.2a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z',
  cells: 'M4 4h4.5v4.5H4zM9.75 9.75h4.5v4.5h-4.5zM15.5 4H20v4.5h-4.5zM4 15.5h4.5V20H4zM15.5 15.5H20V20h-4.5z',
  radar: 'M20.5 12A8.5 8.5 0 1112 3.5M16.5 12A4.5 4.5 0 1112 7.5M12 12l6-6M12 11a1 1 0 100 2 1 1 0 000-2z',
  marquee: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM7 10h6M7 14h4M15.5 12H18M17 10.5l1.5 1.5-1.5 1.5',
  loader: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  emojiFace: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8.5 14.5a4 4 0 007 0M9 9.5h.01M15 9.5h.01M7.5 4.5L6 2.5M16.5 4.5L18 2.5',
  checkCircle: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 12.2l2.8 2.8L16.2 9',
  lock: 'M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  displaySquare: 'M5 3.5h14v14H5zM9 21h6M12 17.5V21',
  displayRound: 'M12 3a7.5 7.5 0 100 15 7.5 7.5 0 000-15zM9 21h6M12 18v3',
  displayWide: 'M2.5 8h19v8h-19zM6 11h5M6 13.5h8',
  displayTall: 'M8 2.5h8v19H8zM10.5 6h3',
  moodLook: 'M12 3a9 9 0 100 18 9 9 0 000-18zM10.5 10h.01M16 10h.01M9.5 15.5h5',
  moodAround: 'M12 3a9 9 0 100 18 9 9 0 000-18zM10 8.5h.01M15.5 8.5h.01M10 15h4',
  moodIdle: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9 10h.01M15 10h.01M9 15c1.6 1.1 4.4 1.1 6 0',
  moodHappy: 'M12 3a9 9 0 100 18 9 9 0 000-18zM7.5 10.5L9 9l1.5 1.5M13.5 10.5L15 9l1.5 1.5M8 13.5a4 4 0 008 0z',
  moodSad: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9 10h.01M15 10h.01M8.5 16.5a4.5 4.5 0 017 0',
  moodAngry: 'M12 3a9 9 0 100 18 9 9 0 000-18zM7.5 8l3 1.5M16.5 8l-3 1.5M9.5 11.5h.01M14.5 11.5h.01M9 16.5c1.6-1.1 4.4-1.1 6 0',
  moodSurprised: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9 9.5h.01M15 9.5h.01M12 13.5a2 2 0 100 4 2 2 0 000-4z',
  moodSleepy: 'M12 3a9 9 0 100 18 9 9 0 000-18zM7.5 10.5c1 .8 2 .8 3 0M13.5 10.5c1 .8 2 .8 3 0M10.5 15.5h3',
  moodLove: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9 11.5L7.5 10a1 1 0 011.5-1.4 1 1 0 011.5 1.4zM15 11.5L13.5 10a1 1 0 011.5-1.4 1 1 0 011.5 1.4zM9 15c1.6 1.2 4.4 1.2 6 0',
  moodWink: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9 10h.01M13.5 10h3M9 15c1.6 1.1 4.4 1.1 6 0',
  moodSuspicious: 'M12 3a9 9 0 100 18 9 9 0 000-18zM7.5 9.5h3M13.5 8l3-1M14.5 10.5h.01M9.5 16l5-1',
  moodDizzy: 'M12 3a9 9 0 100 18 9 9 0 000-18zM7.8 8.8l2.4 2.4M10.2 8.8l-2.4 2.4M13.8 8.8l2.4 2.4M16.2 8.8l-2.4 2.4M8.5 15.5c1.2-1.2 2.3 1.2 3.5 0s2.3 1.2 3.5 0',
  cursor: 'M5 3l13 7.5-5.5 1.8L10.7 18z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  smile: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  wand: 'M4 20L15 9M13 7l4 4M18 3v3M21 6h-3M16 4.5l2 1.5',
  front: 'M8 8h12v12H8zM4 4h12v2M4 4v12h2',
  back: 'M4 4h12v12H4zM20 8v12H8',
  stamp: 'M12 3a3 3 0 00-3 3c0 2 2 3 2 5H7a2 2 0 00-2 2v2h14v-2a2 2 0 00-2-2h-4c0-2 2-3 2-5a3 3 0 00-3-3zM5 20h14',
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
          <IconButton icon="close" title={t('Close')} onClick={props.onClose} />
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
