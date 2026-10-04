// PackBits RLE (see docs/dpa-format.md):
//   c < 128  -> c + 1 literal bytes follow
//   c >= 128 -> next byte repeated c - 126 times (2..129)

export function rleEncode(src: Uint8Array): Uint8Array {
  // Worst case is a single literal before every 2-byte run ("x yy z ww ..."): 3 bytes -> 4.
  const out = new Uint8Array(Math.ceil((src.length * 4) / 3) + 4);
  let o = 0, i = 0;
  const n = src.length;
  while (i < n) {
    let run = 1;
    while (i + run < n && run < 129 && src[i + run] === src[i]) run++;
    if (run >= 2) {
      out[o++] = run + 126;
      out[o++] = src[i];
      i += run;
      continue;
    }
    // Literal run: stop where a repeat of 2+ starts.
    const start = i;
    while (i < n && i - start < 128 && !(i + 1 < n && src[i + 1] === src[i])) i++;
    if (i === start) i++; // single trailing byte
    const len = i - start;
    out[o++] = len - 1;
    out.set(src.subarray(start, i), o);
    o += len;
  }
  return out.slice(0, o);
}

export function rleDecode(src: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let o = 0, i = 0;
  while (i < src.length && o < expected) {
    const c = src[i++];
    if (c < 128) {
      const len = c + 1;
      out.set(src.subarray(i, i + len), o);
      i += len;
      o += len;
    } else {
      out.fill(src[i++], o, o + c - 126);
      o += c - 126;
    }
  }
  if (o !== expected) throw new Error(`RLE: decoded ${o} bytes, expected ${expected}`);
  return out;
}
