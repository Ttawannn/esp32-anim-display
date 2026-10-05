// Every English UI string must have a Thai translation, and no Thai may be hard-coded in the UI.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMOJI, FONTS, ICONS } from '../layers/catalog';
import { CLOCK_PRESETS } from '../layers/clock';
import { PALETTES } from '../model/palettes';
import { CATEGORIES, TEMPLATES } from '../templates/gallery';
import { EYE_ANIMS } from '../templates/eyes';
import { setLang, t } from './index';
import { TH } from './th';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.includes('.test.') ? [p] : [];
});
const sources = files(SRC).map((p) => ({ path: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }));

// Thai that is content, not UI: clock names, a Thai date format, the language name, a font probe.
const THAI_ALLOWED = new Set(['i18n/th.ts', 'i18n/index.ts', 'layers/clock.ts', 'layers/raster.ts', 'ui/LangSwitch.tsx']);

function literalKeys(text: string): string[] {
  const keys: string[] = [];
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (let m; (m = re.exec(text));) keys.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n'));
  return keys;
}

describe('i18n', () => {
  it('has Thai for every t() string in the source', () => {
    const missing = sources.filter((f) => !f.path.startsWith('i18n/')).flatMap((f) => literalKeys(f.text).filter((k) => !(k in TH)).map((k) => `${f.path}: ${k}`));
    expect(missing).toEqual([]);
  });

  it('has Thai for labels the UI translates from data', () => {
    const labels = [
      ...TEMPLATES.flatMap((x) => [x.name, x.hint, ...x.options.flatMap((o) => [o.label, ...(o.type === 'choice' ? o.choices.map((c) => c[1]) : [])])]),
      ...CATEGORIES.map((c) => c.label), ...EMOJI.map((c) => c.label), ...ICONS.map((i) => i.label), ...FONTS.map((f) => f.label),
      ...CLOCK_PRESETS.map((c) => c.label), ...EYE_ANIMS.map((a) => a.name), ...PALETTES.map((p) => p.name),
    ];
    const missing = [...new Set(labels)].filter((l) => !(l in TH) && !/^\d+$/.test(l));
    expect(missing).toEqual([]);
  });

  it('keeps Thai out of UI source', () => {
    const offenders = sources.filter((f) => !THAI_ALLOWED.has(f.path) && /[฀-๿]/.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('translates with placeholders and falls back to English', () => {
    setLang('th');
    expect(t('Installing {pct}%', { pct: 40 })).toBe('กำลังติดตั้ง 40%');
    expect(t('not a known string')).toBe('not a known string');
    setLang('en');
    expect(t('Installing {pct}%', { pct: 40 })).toBe('Installing 40%');
  });
});
