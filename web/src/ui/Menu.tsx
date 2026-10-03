import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './common';

// Closes `onClose` on a pointer-down outside `ref` or on Escape.
export function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open, onClose]);
  return ref;
}

export function Menu(props: {
  label: string;
  icon?: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  align?: 'left' | 'right';
  children: ComponentChildren;
}) {
  const ref = useDismiss(props.open, () => props.onToggle(false));
  return (
    <div class="menu" ref={ref}>
      <button class={`btn ghost${props.open ? ' active' : ''}`} aria-haspopup="menu" aria-expanded={props.open}
        onClick={() => props.onToggle(!props.open)}>
        {props.icon && <Icon name={props.icon} />}
        <span class="lbl">{props.label}</span>
        <Icon name="chevron" />
      </button>
      {props.open && (
        <div class={`menu-panel ${props.align ?? 'left'}`} role="menu" onClick={() => props.onToggle(false)}>
          {props.children}
        </div>
      )}
    </div>
  );
}

export function MenuItem(props: { icon: string; label: string; hint?: string; kbd?: string; onClick: () => void }) {
  return (
    <button class="menu-item" role="menuitem" onClick={props.onClick}>
      <span class="mi-icon"><Icon name={props.icon} /></span>
      <span class="mi-text">
        <span>{props.label}</span>
        {props.hint && <small>{props.hint}</small>}
      </span>
      {props.kbd && <kbd>{props.kbd}</kbd>}
    </button>
  );
}

export const MenuSeparator = () => <div class="menu-sep" />;
