// Date/time formats for clock layers. The board formats the time itself (it keeps time via NTP or
// the editor's clock), so a format is compiled into parts the firmware understands:
//   text   fixed glyph (literal text)
//   number a numeric field drawn with digit glyphs
//   name   one of several pre-rendered names (weekday, month, AM/PM)
//
// Tokens (anything else is literal; wrap literal letters in [brackets]):
//   HH H     hour 00-23 / 0-23          hh h   hour 01-12 / 1-12        A   AM/PM
//   mm ss    minute / second             dd d   day 01-31 / 1-31
//   MM M     month 01-12 / 1-12          MMM    short month name         MMMM  full month name
//   ddd      short weekday name          dddd   full weekday name
//   yyyy yy  year (CE) / 2 digits        BBBB   Buddhist-era year (CE + 543)
//   L        use English names for the following name tokens (Thai is the default)

export type NumberField = 'hour' | 'hour12' | 'minute' | 'second' | 'day' | 'month' | 'year2' | 'year' | 'yearBE';
export type NameField = 'weekday' | 'month' | 'ampm';

export type ClockPart =
  | { kind: 'text'; text: string }
  | { kind: 'number'; field: NumberField; digits: number } // digits = minimum (zero padded)
  | { kind: 'name'; field: NameField; names: string[] };

export interface ClockTime {
  valid: boolean;
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  wday: number; // 0 = Sunday
}

// Field ids and order shared with firmware/src/player/widgets.h.
export const NUMBER_FIELDS: NumberField[] = ['hour', 'hour12', 'minute', 'second', 'day', 'month', 'year2', 'year', 'yearBE'];
export const NAME_FIELDS: NameField[] = ['weekday', 'month', 'ampm'];

const TH = {
  weekdayShort: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
  weekday: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
  monthShort: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  month: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  ampm: ['AM', 'PM'],
};
const EN = {
  weekdayShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  monthShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  month: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ampm: ['AM', 'PM'],
};

const TOKENS: [string, (en: boolean) => ClockPart][] = [
  ['yyyy', () => ({ kind: 'number', field: 'year', digits: 4 })],
  ['BBBB', () => ({ kind: 'number', field: 'yearBE', digits: 4 })],
  ['MMMM', (en) => ({ kind: 'name', field: 'month', names: (en ? EN : TH).month })],
  ['dddd', (en) => ({ kind: 'name', field: 'weekday', names: (en ? EN : TH).weekday })],
  ['MMM', (en) => ({ kind: 'name', field: 'month', names: (en ? EN : TH).monthShort })],
  ['ddd', (en) => ({ kind: 'name', field: 'weekday', names: (en ? EN : TH).weekdayShort })],
  ['yy', () => ({ kind: 'number', field: 'year2', digits: 2 })],
  ['HH', () => ({ kind: 'number', field: 'hour', digits: 2 })],
  ['hh', () => ({ kind: 'number', field: 'hour12', digits: 2 })],
  ['mm', () => ({ kind: 'number', field: 'minute', digits: 2 })],
  ['ss', () => ({ kind: 'number', field: 'second', digits: 2 })],
  ['dd', () => ({ kind: 'number', field: 'day', digits: 2 })],
  ['MM', () => ({ kind: 'number', field: 'month', digits: 2 })],
  ['H', () => ({ kind: 'number', field: 'hour', digits: 1 })],
  ['h', () => ({ kind: 'number', field: 'hour12', digits: 1 })],
  ['d', () => ({ kind: 'number', field: 'day', digits: 1 })],
  ['M', () => ({ kind: 'number', field: 'month', digits: 1 })],
  ['A', () => ({ kind: 'name', field: 'ampm', names: TH.ampm })],
];

export function parseFormat(format: string): ClockPart[] {
  const parts: ClockPart[] = [];
  let text = '';
  let en = false;
  const flush = () => {
    if (text) parts.push({ kind: 'text', text });
    text = '';
  };
  for (let i = 0; i < format.length;) {
    if (format[i] === '[') {
      const end = format.indexOf(']', i + 1);
      text += end < 0 ? format.slice(i + 1) : format.slice(i + 1, end);
      i = end < 0 ? format.length : end + 1;
      continue;
    }
    if (format[i] === 'L') {
      en = true;
      i++;
      continue;
    }
    const token = TOKENS.find(([t]) => format.startsWith(t, i));
    if (token) {
      flush();
      parts.push(token[1](en));
      i += token[0].length;
    } else {
      text += format[i++];
    }
  }
  flush();
  return parts;
}

export function numberValue(field: NumberField, t: ClockTime): number {
  switch (field) {
    case 'hour': return t.hour;
    case 'hour12': return t.hour % 12 || 12;
    case 'minute': return t.minute;
    case 'second': return t.second;
    case 'day': return t.day;
    case 'month': return t.month;
    case 'year2': return t.year % 100;
    case 'year': return t.year;
    case 'yearBE': return t.year + 543;
  }
}

export function nameIndex(field: NameField, t: ClockTime): number {
  return field === 'weekday' ? t.wday : field === 'month' ? t.month - 1 : t.hour < 12 ? 0 : 1;
}

// Plain-text rendering (labels, previews in menus). '-' stands in for an unknown time.
export function formatClock(format: string, t: ClockTime): string {
  return parseFormat(format).map((p) => {
    if (p.kind === 'text') return p.text;
    if (p.kind === 'number') return t.valid ? String(numberValue(p.field, t)).padStart(p.digits, '0') : '-'.repeat(p.digits);
    return t.valid ? p.names[nameIndex(p.field, t)] : '';
  }).join('');
}

export function clockTimeOf(d: Date): ClockTime {
  return {
    valid: true, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
    hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), wday: d.getDay(),
  };
}

export function usesSeconds(format: string): boolean {
  return parseFormat(format).some((p) => p.kind === 'number' && p.field === 'second');
}

// Ready-made formats for the insert panel.
export const CLOCK_PRESETS: { id: string; label: string; format: string; lang?: 'en' | 'th' }[] = [
  { id: 'hm', label: 'Time', format: 'HH:mm' },
  { id: 'hms', label: 'Time + seconds', format: 'HH:mm:ss' },
  { id: 'h12', label: '12-hour time', format: 'h:mm A' },
  { id: 'date-en', label: 'Date', format: 'Lddd d MMM yyyy', lang: 'en' },
  { id: 'date-full-en', label: 'Full date', format: 'Ldddd, MMMM d', lang: 'en' },
  { id: 'weekday-en', label: 'Weekday', format: 'Ldddd', lang: 'en' },
  { id: 'date-th', label: 'Date (Thai)', format: 'd MMM BBBB', lang: 'th' },
  { id: 'date-full-th', label: 'Full date (Thai)', format: 'dddd[ที่] d MMMM BBBB', lang: 'th' },
  { id: 'weekday-th', label: 'Weekday (Thai)', format: 'dddd', lang: 'th' },
  { id: 'date-num', label: 'Numeric date', format: 'dd/MM/yyyy' },
];
