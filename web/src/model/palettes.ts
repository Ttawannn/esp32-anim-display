export interface PalettePreset {
  name: string;
  colors: string[];
}

export const PALETTES: PalettePreset[] = [
  {
    name: 'PICO-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    name: 'Sweetie 16',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ],
  },
  {
    name: 'NES',
    colors: [
      '#000000', '#fcfcfc', '#bcbcbc', '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8', '#0000fc',
      '#b8b8f8', '#6888fc', '#0058f8', '#0000bc', '#d8b8f8', '#9878f8', '#6844fc', '#4428bc',
      '#f8b8f8', '#f878f8', '#d800cc', '#940084', '#f8a4c0', '#f85898', '#e40058', '#a80020',
      '#f0d0b0', '#f87858', '#f83800', '#a81000', '#fce0a8', '#fca044', '#e45c10', '#881400',
      '#f8d878', '#f8b800', '#ac7c00', '#503000', '#d8f878', '#b8f818', '#00b800', '#007800',
      '#b8f8b8', '#58d854', '#00a800', '#006800', '#b8f8d8', '#58f898', '#00a844', '#005800',
    ],
  },
  { name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  {
    name: 'Basic',
    colors: [
      '#000000', '#ffffff', '#808080', '#c0c0c0', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
      '#00ffff', '#ff00ff', '#ff8000', '#8000ff', '#804000', '#008040', '#ff80c0', '#80c0ff',
    ],
  },
];

export const MONO_PALETTE: PalettePreset = { name: 'Black & white', colors: ['#000000', '#ffffff'] };
