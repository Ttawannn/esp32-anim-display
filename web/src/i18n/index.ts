// UI language. Source strings are English; i18n/th.ts maps them to Thai.
//   t('Send to board')                     -> "ส่งไปบอร์ด" in Thai
//   t('Installed {n} moods', { n: 12 })    -> placeholders in {braces}
// Data modules (templates, catalogue) keep English labels and the UI translates them at render
// time, so workers never need this module.

import { TH } from './th';

export type Lang = 'en' | 'th';
export const LANGS: { id: Lang; label: string }[] = [{ id: 'en', label: 'EN' }, { id: 'th', label: 'ไทย' }];

function initial(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'th') return saved;
  } catch { /* storage blocked */ }
  return 'en';
}

let lang: Lang = typeof window === 'undefined' ? 'en' : initial();
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  try { localStorage.setItem('lang', l); } catch { /* not remembered */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  listeners.forEach((fn) => fn(l));
}

export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Text that may or may not be a source string (e.g. an English error from a worker).
export function translateKnown(text: string): string {
  return lang === 'th' ? TH[text] ?? text : text;
}

const missing = new Set<string>();

export function t(en: string, params?: Record<string, string | number>): string {
  const tr = lang === 'th' ? TH[en] : en;
  if (tr === undefined && import.meta.env?.DEV && !missing.has(en)) {
    missing.add(en);
    console.warn('[i18n] no Thai for:', JSON.stringify(en));
  }
  const s = tr ?? en;
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}
