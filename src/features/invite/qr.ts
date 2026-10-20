// A small QR code encoder for invite links: byte mode, error correction level M,
// versions 1-10 (up to 213 bytes, far more than a board URL needs). Pure and
// framework-free so it is easy to test (qr.test.ts decodes what it encodes and
// checks the Reed-Solomon output against the spec's worked example).
//
// Coordinates follow the usual convention: x = column, y = row, (0, 0) top-left.
// Built from ISO/IEC 18004 and the excellent write-ups at thonky.com/qr-code-tutorial
// and nayuki.io/page/qr-code-generator-library.

export interface QrCode {
  version: number;
  /** Modules per side (21 for version 1, +4 per version). */
  size: number;
  /** Mask pattern (0-7) that was applied. */
  mask: number;
  /** size*size, row-major; 1 = dark module. */
  modules: Uint8Array;
}

export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 10;

/**
 * Error correction level M block layout per version: EC codewords per block and
 * the groups of [block count, data codewords per block].
 */
export const EC_M_BLOCKS: Readonly<Record<number, { ec: number; groups: readonly (readonly [number, number])[] }>> = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
};

/** Centers of the alignment patterns per version (rows and columns use the same list). */
const ALIGNMENT: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** Format bits for EC level M (indicator 00). */
const EC_LEVEL_M_BITS = 0;

export function sizeOf(version: number): number {
  return version * 4 + 17;
}

export function dataCodewords(version: number): number {
  return EC_M_BLOCKS[version].groups.reduce((n, [count, len]) => n + count * len, 0);
}

/** Bits used by the byte-mode character count indicator. */
function countBits(version: number): number {
  return version < 10 ? 8 : 16;
}

/** Largest UTF-8 payload (bytes) a version holds in byte mode at level M. */
export function byteCapacity(version: number): number {
  return Math.floor((dataCodewords(version) * 8 - 4 - countBits(version)) / 8);
}

// ---------------------------------------------------------------------------
// GF(256) arithmetic and Reed-Solomon (primitive polynomial x^8+x^4+x^3+x^2+1)
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** α^n in GF(256). */
export function gfExp(n: number): number {
  return EXP[((n % 255) + 255) % 255];
}

/**
 * Coefficients of the RS generator polynomial ∏(x - α^i), i < degree, highest
 * power first with the leading 1 dropped (it is monic).
 */
export function rsGenerator(degree: number): Uint8Array {
  const out = new Uint8Array(degree);
  out[degree - 1] = 1; // start with the polynomial "1"
  let root = 1;
  for (let i = 0; i < degree; i++) {
    // Multiply by (x - root): shift left and add root * current.
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 2);
  }
  return out;
}

/** The EC codewords: remainder of data(x)·x^n divided by the generator. */
export function rsEncode(data: ArrayLike<number>, ecLength: number): Uint8Array {
  const gen = rsGenerator(ecLength);
  const rem = new Uint8Array(ecLength);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLength - 1] = 0;
    for (let j = 0; j < ecLength; j++) rem[j] ^= gfMul(gen[j], factor);
  }
  return rem;
}

// ---------------------------------------------------------------------------
// Data codewords
// ---------------------------------------------------------------------------

class BitBuffer {
  readonly bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/** Mode + count + payload + terminator + padding, as data codewords for `version`. */
export function buildDataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const capacityBits = dataCodewords(version) * 8;
  const buf = new BitBuffer();
  buf.put(0b0100, 4); // byte mode
  buf.put(bytes.length, countBits(version));
  for (const b of bytes) buf.put(b, 8);
  if (buf.bits.length > capacityBits) throw new RangeError("Data too long for this QR version");
  buf.put(0, Math.min(4, capacityBits - buf.bits.length)); // terminator
  buf.put(0, (8 - (buf.bits.length % 8)) % 8); // byte align
  const out = new Uint8Array(capacityBits / 8);
  for (let i = 0; i < buf.bits.length; i++) out[i >>> 3] |= buf.bits[i] << (7 - (i & 7));
  for (let i = buf.bits.length / 8, pad = 0xec; i < out.length; i++, pad ^= 0xec ^ 0x11) out[i] = pad;
  return out;
}

/** Split into blocks, add EC to each, and interleave (data first, then EC). */
export function interleave(data: Uint8Array, version: number): Uint8Array {
  const { ec, groups } = EC_M_BLOCKS[version];
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let offset = 0;
  for (const [count, len] of groups) {
    for (let b = 0; b < count; b++) {
      const slice = data.subarray(offset, offset + len);
      offset += len;
      blocks.push({ data: slice, ec: rsEncode(slice, ec) });
    }
  }
  const out: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

class Matrix {
  readonly modules: Uint8Array;
  readonly isFunction: Uint8Array;
  constructor(readonly size: number) {
    this.modules = new Uint8Array(size * size);
    this.isFunction = new Uint8Array(size * size);
  }
  get(x: number, y: number): number {
    return this.modules[y * this.size + x];
  }
  setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y * this.size + x] = dark ? 1 : 0;
    this.isFunction[y * this.size + x] = 1;
  }
}

function drawFinder(m: Matrix, cx: number, cy: number): void {
  // 7x7 finder plus its one-module light separator (clipped at the edges).
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= m.size || y >= m.size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      m.setFunction(x, y, d !== 2 && d !== 4);
    }
  }
}

function drawAlignment(m: Matrix, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      m.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/** 15-bit format word (EC level M + mask) with its BCH code, masked with 0x5412. */
export function formatBits(mask: number): number {
  const data = (EC_LEVEL_M_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** 18-bit version word (versions 7+) with its BCH code. */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | (rem & 0xfff);
}

const bit = (value: number, i: number): boolean => ((value >>> i) & 1) !== 0;

function drawFormat(m: Matrix, mask: number): void {
  const bits = formatBits(mask);
  const n = m.size;
  // Around the top-left finder.
  for (let i = 0; i <= 5; i++) m.setFunction(8, i, bit(bits, i));
  m.setFunction(8, 7, bit(bits, 6));
  m.setFunction(8, 8, bit(bits, 7));
  m.setFunction(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) m.setFunction(14 - i, 8, bit(bits, i));
  // Split between the top-right and bottom-left finders.
  for (let i = 0; i < 8; i++) m.setFunction(n - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) m.setFunction(8, n - 15 + i, bit(bits, i));
  m.setFunction(8, n - 8, true); // the dark module
}

function drawVersion(m: Matrix, version: number): void {
  if (version < 7) return;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const a = m.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    m.setFunction(a, b, bit(bits, i));
    m.setFunction(b, a, bit(bits, i));
  }
}

function drawFunctionPatterns(m: Matrix, version: number): void {
  const n = m.size;
  for (let i = 0; i < n; i++) {
    m.setFunction(6, i, i % 2 === 0);
    m.setFunction(i, 6, i % 2 === 0);
  }
  drawFinder(m, 3, 3);
  drawFinder(m, n - 4, 3);
  drawFinder(m, 3, n - 4);
  const pos = ALIGNMENT[version];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      // Skip the three corners that overlap finders.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      drawAlignment(m, pos[i], pos[j]);
    }
  }
  drawFormat(m, 0); // reserve the area; redrawn per mask
  drawVersion(m, version);
}

/** Zigzag placement in two-column strips from the bottom-right, skipping the vertical timing column. */
function drawCodewords(m: Matrix, codewords: Uint8Array): void {
  const n = m.size;
  let i = 0;
  const total = codewords.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < n; vert++) {
      const y = upward ? n - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (m.isFunction[y * n + x]) continue;
        // Remainder bits (past the last codeword) stay light before masking.
        if (i < total) m.modules[y * n + x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
        i++;
      }
    }
  }
}

export function maskApplies(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError(`Unknown mask ${mask}`);
  }
}

function applyMask(m: Matrix, mask: number): void {
  const n = m.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!m.isFunction[y * n + x] && maskApplies(mask, x, y)) m.modules[y * n + x] ^= 1;
    }
  }
}

/** The spec's four penalty rules; the mask with the lowest score is used. */
export function penalty(modules: Uint8Array, n: number): number {
  let score = 0;
  const at = (x: number, y: number) => modules[y * n + x];

  // N1: runs of five or more same-colored modules in a row or column.
  for (let a = 0; a < n; a++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        const cur = horizontal ? at(b, a) : at(a, b);
        const prev = horizontal ? at(b - 1, a) : at(a, b - 1);
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // N2: 2x2 blocks of one color.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3;
    }
  }

  // N3: finder-like 1:1:3:1:1 patterns with four light modules on one side.
  const patterns = [
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
  ];
  for (let a = 0; a < n; a++) {
    for (let b = 0; b + 11 <= n; b++) {
      for (const p of patterns) {
        let row = true;
        let col = true;
        for (let k = 0; k < 11 && (row || col); k++) {
          if (at(b + k, a) !== p[k]) row = false;
          if (at(a, b + k) !== p[k]) col = false;
        }
        if (row) score += 40;
        if (col) score += 40;
      }
    }
  }

  // N4: balance of dark and light.
  let dark = 0;
  for (const v of modules) dark += v;
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** Smallest version (1-10) whose level-M byte capacity fits `byteLength`, or null. */
export function versionFor(byteLength: number, minVersion = QR_MIN_VERSION): number | null {
  for (let v = Math.max(QR_MIN_VERSION, minVersion); v <= QR_MAX_VERSION; v++) {
    if (byteLength <= byteCapacity(v)) return v;
  }
  return null;
}

export interface EncodeOptions {
  /** Force a mask (0-7) instead of picking the lowest-penalty one. */
  mask?: number;
  minVersion?: number;
}

/** Encode text (UTF-8, byte mode) at error correction level M. Throws RangeError when it doesn't fit version 10. */
export function encodeQr(text: string, opts: EncodeOptions = {}): QrCode {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length, opts.minVersion);
  if (version === null) throw new RangeError(`Text too long for a QR code (${bytes.length} bytes, max ${byteCapacity(QR_MAX_VERSION)})`);
  const codewords = interleave(buildDataCodewords(bytes, version), version);

  const base = new Matrix(sizeOf(version));
  drawFunctionPatterns(base, version);
  drawCodewords(base, codewords);

  const candidates = opts.mask !== undefined ? [opts.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  let best: { mask: number; modules: Uint8Array; score: number } | null = null;
  for (const mask of candidates) {
    const m = new Matrix(base.size);
    m.modules.set(base.modules);
    m.isFunction.set(base.isFunction);
    applyMask(m, mask);
    drawFormat(m, mask);
    const score = candidates.length === 1 ? 0 : penalty(m.modules, m.size);
    if (!best || score < best.score) best = { mask, modules: m.modules, score };
  }
  return { version, size: base.size, mask: best!.mask, modules: best!.modules };
}

/** True when the module at (x, y) is dark; anything outside the symbol (the quiet zone) is light. */
export function isDark(qr: QrCode, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= qr.size || y >= qr.size) return false;
  return qr.modules[y * qr.size + x] === 1;
}

/** True for modules inside one of the three 7x7 finder patterns (renderers may draw those as rounded "eyes"). */
export function inFinder(size: number, x: number, y: number): boolean {
  const inBox = (bx: number, by: number) => x >= bx && x < bx + 7 && y >= by && y < by + 7;
  return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7);
}
