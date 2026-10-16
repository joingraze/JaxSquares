import { describe, expect, it } from "vitest";
import {
  buildDataCodewords,
  byteCapacity,
  encodeQr,
  formatBits,
  gfExp,
  interleave,
  isDark,
  QR_MAX_VERSION,
  rsEncode,
  rsGenerator,
  sizeOf,
  versionBits,
  versionFor,
  type QrCode,
} from "./qr";

// ---------------------------------------------------------------------------
// An independent decoder for clean (unrotated, undamaged) symbols. It is written
// from the spec's (row, column) description rather than reusing the encoder's
// placement code, and checks every block's Reed-Solomon syndromes.
// ---------------------------------------------------------------------------

/** ISO 18004 table C.1: format strings for EC level M, masks 0-7. */
const FORMAT_M = [
  "101010000010010",
  "101000100100101",
  "101111001111100",
  "101101101001011",
  "100010111111001",
  "100000011001110",
  "100111110010111",
  "100101010100000",
];

/** Level M: total codewords, EC per block, blocks as data lengths. */
const LAYOUT_M: Record<number, { total: number; ec: number; blocks: number[] }> = {
  1: { total: 26, ec: 10, blocks: [16] },
  2: { total: 44, ec: 16, blocks: [28] },
  3: { total: 70, ec: 26, blocks: [44] },
  4: { total: 100, ec: 18, blocks: [32, 32] },
  5: { total: 134, ec: 24, blocks: [43, 43] },
  6: { total: 172, ec: 16, blocks: [27, 27, 27, 27] },
  7: { total: 196, ec: 18, blocks: [31, 31, 31, 31] },
  8: { total: 242, ec: 22, blocks: [38, 38, 39, 39] },
  9: { total: 292, ec: 22, blocks: [36, 36, 36, 37, 37] },
  10: { total: 346, ec: 26, blocks: [43, 43, 43, 43, 44] },
};

const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// Local GF(256) so the syndrome check doesn't trust the encoder's tables.
const gexp: number[] = [];
const glog: number[] = [];
{
  let v = 1;
  for (let i = 0; i < 255; i++) {
    gexp[i] = v;
    glog[v] = i;
    v = (v << 1) ^ (v & 0x80 ? 0x11d : 0);
  }
}
const gmul = (a: number, b: number) => (a && b ? gexp[(glog[a] + glog[b]) % 255] : 0);

function maskBit(mask: number, i: number, j: number): boolean {
  // i = row, j = column, as written in the spec.
  switch (mask) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    default: return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
  }
}

function decode(qr: QrCode): { text: string; mask: number; version: number } {
  const n = qr.size;
  const version = (n - 17) / 4;
  expect(Number.isInteger(version)).toBe(true);
  const get = (row: number, col: number) => qr.modules[row * n + col];

  // Format info, most significant bit first.
  const copy1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const copy2: [number, number][] = [];
  for (let k = 1; k <= 7; k++) copy2.push([n - k, 8]);
  for (let k = 8; k >= 1; k--) copy2.push([8, n - k]);
  const read = (cells: [number, number][]) => cells.map(([r, c]) => get(r, c)).join("");
  const f1 = read(copy1);
  expect(read(copy2)).toBe(f1);
  const mask = FORMAT_M.indexOf(f1);
  expect(mask).toBeGreaterThanOrEqual(0);
  expect(get(n - 8, 8)).toBe(1); // dark module

  if (version >= 7) {
    // Version block above the bottom-left finder: bit k at row n-11+(k%3), col floor(k/3).
    let v = 0;
    for (let k = 17; k >= 0; k--) v = (v << 1) | get(n - 11 + (k % 3), Math.floor(k / 3));
    expect(v >>> 12).toBe(version);
  }

  const align = ALIGN[version];
  const isFunction = (r: number, c: number): boolean => {
    if (r < 9 && c < 9) return true; // top-left finder, separator, format
    if (r < 9 && c >= n - 8) return true; // top-right
    if (r >= n - 8 && c < 9) return true; // bottom-left (+ dark module)
    if (r === 6 || c === 6) return true; // timing
    if (version >= 7 && ((r < 6 && c >= n - 11 && c < n - 8) || (c < 6 && r >= n - 11 && r < n - 8))) return true;
    for (const ar of align) {
      for (const ac of align) {
        const overlapsFinder = (ar === 6 && ac === 6) || (ar === 6 && ac === align[align.length - 1]) || (ar === align[align.length - 1] && ac === 6);
        if (!overlapsFinder && Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
      }
    }
    return false;
  };

  const bits: number[] = [];
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let k = 0; k < n; k++) {
      const row = upward ? n - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (!isFunction(row, c)) bits.push(get(row, c) ^ (maskBit(mask, row, c) ? 1 : 0));
      }
    }
    upward = !upward;
  }

  const layout = LAYOUT_M[version];
  const codewords: number[] = [];
  for (let i = 0; i < layout.total; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
    codewords.push(b);
  }
  // Remainder bits must be zero after unmasking.
  expect(bits.slice(layout.total * 8).every((b) => b === 0)).toBe(true);

  // De-interleave.
  const blocks = layout.blocks.map((len) => ({ data: [] as number[], ec: [] as number[], len }));
  let p = 0;
  const maxLen = Math.max(...layout.blocks);
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.len) b.data.push(codewords[p++]);
  for (let i = 0; i < layout.ec; i++) for (const b of blocks) b.ec.push(codewords[p++]);
  expect(p).toBe(layout.total);

  // Every block's syndromes S_i = c(α^i) must be zero.
  for (const b of blocks) {
    const poly = [...b.data, ...b.ec];
    for (let i = 0; i < layout.ec; i++) {
      const x = gexp[i];
      let s = 0;
      for (const coef of poly) s = gmul(s, x) ^ coef;
      expect(s).toBe(0);
    }
  }

  // Parse byte mode.
  const data = blocks.flatMap((b) => b.data);
  const stream = data.flatMap((byte) => Array.from({ length: 8 }, (_, k) => (byte >>> (7 - k)) & 1));
  let q = 0;
  const take = (len: number) => {
    let v = 0;
    for (let k = 0; k < len; k++) v = (v << 1) | stream[q++];
    return v;
  };
  expect(take(4)).toBe(0b0100);
  const count = take(version < 10 ? 8 : 16);
  const bytes = Uint8Array.from({ length: count }, () => take(8));
  return { text: new TextDecoder().decode(bytes), mask, version };
}

// ---------------------------------------------------------------------------

describe("Reed-Solomon", () => {
  it("builds the spec's degree-10 generator polynomial", () => {
    // α exponents of x^9..x^0 for degree 10 (the x^10 term is 1).
    const exps = [251, 67, 46, 61, 118, 70, 64, 94, 32, 45];
    expect(Array.from(rsGenerator(10))).toEqual(exps.map((e) => gfExp(e)));
  });

  it("matches the worked example for HELLO WORLD at 1-M", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(Array.from(rsEncode(data, 10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
});

describe("format and version information", () => {
  it("matches the spec table for level M", () => {
    for (let mask = 0; mask < 8; mask++) {
      expect(formatBits(mask).toString(2).padStart(15, "0")).toBe(FORMAT_M[mask]);
    }
  });

  it("matches the spec table for versions 7-10", () => {
    expect(versionBits(7)).toBe(0x07c94);
    expect(versionBits(8)).toBe(0x085bc);
    expect(versionBits(9)).toBe(0x09a99);
    expect(versionBits(10)).toBe(0x0a4d3);
  });
});

describe("data codewords", () => {
  it("encodes byte mode with terminator and alternating pad bytes", () => {
    // "A" at version 1: 0100 00000001 01000001 0000 then pad.
    const cw = Array.from(buildDataCodewords(new TextEncoder().encode("A"), 1));
    expect(cw.slice(0, 3)).toEqual([0b01000000, 0b00010100, 0b00010000]);
    expect(cw.slice(3, 7)).toEqual([0xec, 0x11, 0xec, 0x11]);
    expect(cw).toHaveLength(16);
  });

  it("interleaves blocks data-first", () => {
    const data = Uint8Array.from({ length: 154 }, (_, i) => i);
    const out = interleave(data, 8); // blocks of 38, 38, 39, 39
    expect(out).toHaveLength(242);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 38, 76, 115]);
    // The last data codewords come from the two longer blocks only.
    expect(Array.from(out.slice(152, 154))).toEqual([114, 153]);
  });

  it("knows each version's byte capacity", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(byteCapacity)).toEqual([14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
    expect(versionFor(14)).toBe(1);
    expect(versionFor(15)).toBe(2);
    expect(versionFor(31)).toBe(3);
    expect(versionFor(214)).toBeNull();
  });
});

describe("encodeQr", () => {
  const samples = [
    "A",
    "https://jaxsquares.com/g/k7mq2x",
    "http://127.0.0.1:5202/g/abc234",
    "Grab a square 🏈 on Chiefs vs Bills",
    "x".repeat(62),
    "y".repeat(100),
    "z".repeat(122),
    "https://jaxsquares.com/g/".padEnd(150, "q"),
    "w".repeat(180),
    "v".repeat(213),
  ];

  it.each(samples)("round-trips %#", (text) => {
    const qr = encodeQr(text);
    expect(qr.size).toBe(sizeOf(qr.version));
    const decoded = decode(qr);
    expect(decoded.text).toBe(text);
    expect(decoded.mask).toBe(qr.mask);
  });

  it("round-trips with every mask", () => {
    for (let mask = 0; mask < 8; mask++) {
      const qr = encodeQr("https://jaxsquares.com/g/k7mq2x", { mask });
      expect(qr.mask).toBe(mask);
      expect(decode(qr).text).toBe("https://jaxsquares.com/g/k7mq2x");
    }
  });

  it("uses the smallest version that fits", () => {
    expect(encodeQr("https://jaxsquares.com/g/k7mq2x").version).toBe(3);
    expect(encodeQr("A").version).toBe(1);
    expect(encodeQr("v".repeat(213)).version).toBe(QR_MAX_VERSION);
  });

  it("draws finder patterns and timing", () => {
    const qr = encodeQr("https://jaxsquares.com/g/k7mq2x");
    const n = qr.size;
    // Finder rings: dark border, light ring, dark 3x3 core.
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      expect(isDark(qr, ox, oy)).toBe(true);
      expect(isDark(qr, ox + 1, oy + 1)).toBe(false);
      expect(isDark(qr, ox + 3, oy + 3)).toBe(true);
    }
    for (let i = 8; i < n - 8; i++) {
      expect(isDark(qr, i, 6)).toBe(i % 2 === 0);
      expect(isDark(qr, 6, i)).toBe(i % 2 === 0);
    }
    expect(isDark(qr, -1, 0)).toBe(false);
  });

  it("rejects text that doesn't fit", () => {
    expect(() => encodeQr("x".repeat(214))).toThrow(RangeError);
  });
});
