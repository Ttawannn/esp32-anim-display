// What the insert panel offers: emoji by category, built-in icons, fonts.
// Icons are drawn with canvas paths in a 100×100 box so they stay sharp at any size.

import type { FontId } from '../model/types';

export const FONTS: { id: FontId; label: string; css: string }[] = [
  { id: 'sans', label: 'Standard', css: '"Segoe UI", "Leelawadee UI", "Noto Sans Thai", "Sukhumvit Set", system-ui, sans-serif' },
  { id: 'round', label: 'Rounded', css: '"Trebuchet MS", "Leelawadee UI", "Noto Sans Thai Looped", "Thonburi", sans-serif' },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Angsana New", "Noto Serif Thai", serif' },
  { id: 'mono', label: 'Digital', css: 'Consolas, "Cascadia Mono", "Courier New", "Noto Sans Mono", monospace' },
  { id: 'pixel', label: 'Pixel', css: '"Segoe UI", "Leelawadee UI", "Noto Sans Thai", system-ui, sans-serif' },
];

export function fontCss(id: FontId): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).css;
}

export const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

export const EMOJI: { id: string; label: string; items: string }[] = [
  { id: 'face', label: 'Faces', items: '😀 😄 😁 😆 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 😎 🤓 🥳 🤩 😏 😴 🥱 😪 😮 😲 😳 🥺 😢 😭 😤 😠 😡 🤯 😱 🤔 🫡 🤫 🙄 😬 😵 🤒 🤖 👻 💀 👽 😺 😸 😻' },
  { id: 'heart', label: 'Hearts', items: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 💔 ❣️ 💯 💢 💥 💫 💦 💨 💬 💭 💤' },
  { id: 'hand', label: 'Hands', items: '👍 👎 👌 ✌️ 🤞 🤟 🤘 👋 👏 🙌 🙏 💪 👉 👈 👆 👇 ☝️ ✋ 🤚 🫶' },
  { id: 'animal', label: 'Animals', items: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐠 🐬 🐳 🦖 🐉' },
  { id: 'food', label: 'Food', items: '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍔 🍟 🍕 🌭 🌮 🍜 🍣 🍙 🍦 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🧋 🍺' },
  { id: 'weather', label: 'Weather', items: '☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 🌪️ 🌫️ 🌈 ☔ 💧 🔥 ⚡ 🌙 🌛 ⭐ 🌟 ✨ ☄️ 🌍' },
  { id: 'thing', label: 'Objects', items: '🎉 🎊 🎈 🎁 🎀 🏆 🥇 🎮 🕹️ 🎲 🎵 🎶 🎤 🎧 📷 💡 🔋 🔌 📱 💻 ⌚ ⏰ ⏳ 📅 📌 🔔 🔑 🔒 💰 💎 🚀 🚗 ✈️ 🏠 🌸 🌻 🌹 🍀 🌲 🌵' },
  { id: 'symbol', label: 'Symbols', items: '✅ ❌ ⭕ ❗ ❓ ⚠️ 🚫 ⛔ ♻️ ✔️ ➕ ➖ ✖️ ➡️ ⬅️ ⬆️ ⬇️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟩 🟦 🔺 🔻 💠 🔶' },
];

export function emojiList(items: string): string[] {
  return items.split(' ').filter(Boolean);
}

type Draw = (c: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => void;

const circle = (c: Parameters<Draw>[0], x: number, y: number, r: number) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); };
const poly = (c: Parameters<Draw>[0], pts: number[]) => {
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
};
const stroke = (c: Parameters<Draw>[0], w: number, path: () => void) => {
  c.beginPath(); path(); c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
};
const fill = (c: Parameters<Draw>[0], path: () => void, rule: CanvasFillRule = 'nonzero') => { c.beginPath(); path(); c.fill(rule); };

// Every icon fills/strokes with the current style; the caller sets the colour.
export const ICONS: { id: string; label: string; draw: Draw }[] = [
  { id: 'heart', label: 'Heart', draw: (c) => fill(c, () => {
    c.moveTo(50, 88); c.bezierCurveTo(10, 60, 4, 38, 18, 22); c.bezierCurveTo(30, 10, 46, 14, 50, 28);
    c.bezierCurveTo(54, 14, 70, 10, 82, 22); c.bezierCurveTo(96, 38, 90, 60, 50, 88);
  }) },
  { id: 'star', label: 'Star', draw: (c) => fill(c, () => {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 19 : 46, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(50 + r * Math.cos(a), 54 + r * Math.sin(a));
    }
    poly(c, pts);
  }) },
  { id: 'sun', label: 'Sun', draw: (c) => {
    fill(c, () => circle(c, 50, 50, 20));
    stroke(c, 8, () => { for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; c.moveTo(50 + 31 * Math.cos(a), 50 + 31 * Math.sin(a)); c.lineTo(50 + 44 * Math.cos(a), 50 + 44 * Math.sin(a)); } });
  } },
  { id: 'moon', label: 'Moon', draw: (c) => fill(c, () => {
    c.moveTo(62, 10); c.arc(50, 50, 40, -1.27, 1.27, true); c.arc(66, 50, 32, 1.1, -1.1, false); c.closePath();
  }) },
  { id: 'cloud', label: 'Cloud', draw: (c) => fill(c, () => {
    circle(c, 34, 58, 18); circle(c, 54, 46, 24); circle(c, 72, 60, 16); c.rect(16, 58, 72, 18);
  }) },
  { id: 'rain', label: 'Rain', draw: (c) => {
    fill(c, () => { circle(c, 34, 40, 15); circle(c, 52, 32, 20); circle(c, 70, 42, 13); c.rect(19, 40, 64, 15); });
    stroke(c, 7, () => { for (const x of [30, 50, 70]) { c.moveTo(x, 66); c.lineTo(x - 6, 86); } });
  } },
  { id: 'snow', label: 'Snowflake', draw: (c) => stroke(c, 7, () => {
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; c.moveTo(50 - 40 * Math.cos(a), 50 - 40 * Math.sin(a)); c.lineTo(50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)); }
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3, x = 50 + 28 * Math.cos(a), y = 50 + 28 * Math.sin(a);
      c.moveTo(x, y); c.lineTo(x + 10 * Math.cos(a + 2.4), y + 10 * Math.sin(a + 2.4)); c.moveTo(x, y); c.lineTo(x + 10 * Math.cos(a - 2.4), y + 10 * Math.sin(a - 2.4)); }
  }) },
  { id: 'bolt', label: 'Lightning', draw: (c) => fill(c, () => poly(c, [58, 6, 20, 56, 46, 56, 38, 94, 80, 40, 54, 40, 64, 6])) },
  { id: 'drop', label: 'Drop', draw: (c) => fill(c, () => {
    c.moveTo(50, 8); c.bezierCurveTo(30, 40, 20, 52, 20, 64); c.arc(50, 64, 30, Math.PI, 0, true); c.bezierCurveTo(80, 52, 70, 40, 50, 8);
  }) },
  { id: 'fire', label: 'Fire', draw: (c) => fill(c, () => {
    c.moveTo(50, 6); c.bezierCurveTo(56, 26, 80, 36, 80, 62); c.bezierCurveTo(80, 82, 66, 94, 50, 94);
    c.bezierCurveTo(32, 94, 20, 82, 20, 64); c.bezierCurveTo(20, 50, 30, 42, 34, 34); c.bezierCurveTo(36, 46, 42, 52, 46, 52);
    c.bezierCurveTo(40, 34, 44, 18, 50, 6);
  }) },
  { id: 'wifi', label: 'Wi-Fi', draw: (c) => {
    stroke(c, 9, () => { for (const r of [16, 32, 48]) { c.moveTo(50 - r * 0.92, 80 - r * 0.38); c.arc(50, 80, r, -Math.PI + 0.39, -0.39); } });
    fill(c, () => circle(c, 50, 80, 7));
  } },
  { id: 'battery', label: 'Battery', draw: (c) => {
    stroke(c, 7, () => c.rect(10, 28, 72, 44));
    fill(c, () => { c.rect(84, 40, 8, 20); c.rect(20, 38, 40, 24); });
  } },
  { id: 'note', label: 'Music note', draw: (c) => {
    fill(c, () => { c.ellipse(32, 76, 15, 11, -0.4, 0, Math.PI * 2); c.ellipse(76, 66, 15, 11, -0.4, 0, Math.PI * 2); });
    fill(c, () => poly(c, [42, 76, 42, 20, 90, 8, 90, 66, 84, 66, 84, 24, 48, 33, 48, 76]));
  } },
  { id: 'bell', label: 'Bell', draw: (c) => fill(c, () => {
    c.moveTo(50, 10); c.bezierCurveTo(28, 10, 24, 32, 24, 50); c.lineTo(14, 72); c.lineTo(86, 72); c.lineTo(76, 50);
    c.bezierCurveTo(76, 32, 72, 10, 50, 10); c.closePath(); circle(c, 50, 82, 9);
  }) },
  { id: 'home', label: 'Home', draw: (c) => fill(c, () => poly(c, [50, 10, 92, 48, 80, 48, 80, 90, 60, 90, 60, 64, 40, 64, 40, 90, 20, 90, 20, 48, 8, 48])) },
  { id: 'check', label: 'Check', draw: (c) => stroke(c, 14, () => { c.moveTo(14, 52); c.lineTo(40, 78); c.lineTo(88, 24); }) },
  { id: 'cross', label: 'Cross', draw: (c) => stroke(c, 14, () => { c.moveTo(18, 18); c.lineTo(82, 82); c.moveTo(82, 18); c.lineTo(18, 82); }) },
  { id: 'up', label: 'Arrow up', draw: (c) => fill(c, () => poly(c, [50, 8, 90, 50, 64, 50, 64, 92, 36, 92, 36, 50, 10, 50])) },
  { id: 'down', label: 'Arrow down', draw: (c) => fill(c, () => poly(c, [50, 92, 90, 50, 64, 50, 64, 8, 36, 8, 36, 50, 10, 50])) },
  { id: 'right', label: 'Arrow right', draw: (c) => fill(c, () => poly(c, [92, 50, 50, 90, 50, 64, 8, 64, 8, 36, 50, 36, 50, 10])) },
  { id: 'left', label: 'Arrow left', draw: (c) => fill(c, () => poly(c, [8, 50, 50, 90, 50, 64, 92, 64, 92, 36, 50, 36, 50, 10])) },
  { id: 'play', label: 'Play', draw: (c) => fill(c, () => poly(c, [22, 10, 86, 50, 22, 90])) },
  { id: 'pause', label: 'Pause', draw: (c) => fill(c, () => { c.rect(20, 12, 22, 76); c.rect(58, 12, 22, 76); }) },
  { id: 'thermo', label: 'Thermometer', draw: (c) => {
    stroke(c, 8, () => { c.moveTo(40, 64); c.lineTo(40, 18); c.arc(50, 18, 10, Math.PI, 0); c.lineTo(60, 64); });
    fill(c, () => { circle(c, 50, 76, 17); c.rect(45, 34, 10, 40); });
  } },
  { id: 'smile', label: 'Smiley', draw: (c) => {
    stroke(c, 8, () => circle(c, 50, 50, 40));
    fill(c, () => { circle(c, 36, 40, 6); circle(c, 64, 40, 6); });
    stroke(c, 8, () => { c.moveTo(30, 58); c.quadraticCurveTo(50, 80, 70, 58); });
  } },
  { id: 'sad', label: 'Sad face', draw: (c) => {
    stroke(c, 8, () => circle(c, 50, 50, 40));
    fill(c, () => { circle(c, 36, 40, 6); circle(c, 64, 40, 6); });
    stroke(c, 8, () => { c.moveTo(30, 72); c.quadraticCurveTo(50, 52, 70, 72); });
  } },
  { id: 'pin', label: 'Pin', draw: (c) => fill(c, () => {
    c.moveTo(50, 94); c.bezierCurveTo(30, 66, 18, 52, 18, 38); c.arc(50, 38, 32, Math.PI, 0); c.bezierCurveTo(82, 52, 70, 66, 50, 94);
    c.closePath(); circle(c, 50, 38, 12);
  }, 'evenodd') },
  { id: 'chat', label: 'Chat', draw: (c) => fill(c, () => {
    c.moveTo(20, 14); c.lineTo(80, 14); c.quadraticCurveTo(92, 14, 92, 26); c.lineTo(92, 58); c.quadraticCurveTo(92, 70, 80, 70);
    c.lineTo(42, 70); c.lineTo(22, 88); c.lineTo(26, 70); c.lineTo(20, 70); c.quadraticCurveTo(8, 70, 8, 58); c.lineTo(8, 26);
    c.quadraticCurveTo(8, 14, 20, 14);
  }) },
  { id: 'lock', label: 'Lock', draw: (c) => {
    stroke(c, 9, () => { c.moveTo(30, 46); c.lineTo(30, 32); c.arc(50, 32, 20, Math.PI, 0); c.lineTo(70, 46); });
    fill(c, () => { c.rect(18, 44, 64, 46); });
  } },
  { id: 'gift', label: 'Gift', draw: (c) => {
    fill(c, () => { c.rect(14, 34, 72, 16); c.rect(20, 54, 60, 38); });
    stroke(c, 7, () => { c.moveTo(50, 32); c.bezierCurveTo(30, 8, 18, 30, 50, 32); c.moveTo(50, 32); c.bezierCurveTo(70, 8, 82, 30, 50, 32); });
  } },
  { id: 'leaf', label: 'Leaf', draw: (c) => {
    fill(c, () => { c.moveTo(16, 84); c.bezierCurveTo(10, 30, 50, 10, 90, 10); c.bezierCurveTo(90, 50, 70, 90, 16, 84); });
  } },
  { id: 'flower', label: 'Flower', draw: (c) => fill(c, () => {
    for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; circle(c, 50 + 24 * Math.cos(a), 50 + 24 * Math.sin(a), 16); }
    circle(c, 50, 50, 14);
  }) },
  { id: 'clock', label: 'Clock', draw: (c) => {
    stroke(c, 8, () => circle(c, 50, 50, 40));
    stroke(c, 8, () => { c.moveTo(50, 26); c.lineTo(50, 50); c.lineTo(68, 60); });
  } },
  { id: 'cat', label: 'Cat', draw: (c) => fill(c, () => {
    poly(c, [16, 14, 38, 34, 62, 34, 84, 14, 86, 58, 50, 90, 14, 58]);
  }) },
  { id: 'skull', label: 'Skull', draw: (c) => {
    fill(c, () => { c.moveTo(14, 46); c.arc(50, 46, 36, Math.PI, 0); c.lineTo(86, 62); c.lineTo(70, 70); c.lineTo(70, 90); c.lineTo(30, 90); c.lineTo(30, 70); c.lineTo(14, 62); c.closePath();
      circle(c, 36, 50, 10); circle(c, 64, 50, 10); }, 'evenodd');
  } },
];
