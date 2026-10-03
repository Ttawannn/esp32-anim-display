export function to565(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

// Expand to 8-bit per channel the way a panel shows it (replicate high bits into low bits).
export function from565(c: number): [number, number, number] {
  const r = (c >> 11) & 0x1f, g = (c >> 5) & 0x3f, b = c & 0x1f;
  return [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)];
}

// 65536-entry lookup of packed 0xRRGGBB, built on first use.
let expandTable: Uint32Array | null = null;
export function expand565Table(): Uint32Array {
  if (!expandTable) {
    expandTable = new Uint32Array(65536);
    for (let c = 0; c < 65536; c++) {
      const [r, g, b] = from565(c);
      expandTable[c] = (r << 16) | (g << 8) | b;
    }
  }
  return expandTable;
}
