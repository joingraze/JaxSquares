// Test-only: a stand-in App Store signing chain (root -> intermediate -> leaf)
// built with WebCrypto and a tiny DER writer, so appleJws.ts is tested against
// real X.509 certificates and real ECDSA signatures. The root is ours, so tests
// pass its SHA-256 as `rootSha256`; production only ever trusts Apple's.

import { APPLE_INTERMEDIATE_MARKER, APPLE_LEAF_MARKER } from "./appleJws";
import { base64UrlEncode, bytesToHex, utf8 } from "./encoding";

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

function len(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

const tlv = (tag: number, ...parts: Uint8Array[]) => {
  const body = concat(...parts);
  return concat(Uint8Array.of(tag), len(body.length), body);
};
const seq = (...parts: Uint8Array[]) => tlv(0x30, ...parts);
const set = (...parts: Uint8Array[]) => tlv(0x31, ...parts);
const nul = () => Uint8Array.of(0x05, 0x00);
const bool = (v: boolean) => Uint8Array.of(0x01, 0x01, v ? 0xff : 0x00);
const octets = (v: Uint8Array) => tlv(0x04, v);
const bits = (v: Uint8Array) => tlv(0x03, Uint8Array.of(0), v);
const explicit = (n: number, inner: Uint8Array) => tlv(0xa0 + n, inner);

function int(bytes: Uint8Array): Uint8Array {
  let v = bytes;
  while (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) v = v.slice(1);
  if (v[0] & 0x80) v = concat(Uint8Array.of(0), v);
  return tlv(0x02, v);
}

function oid(dotted: string): Uint8Array {
  const [a, b, ...rest] = dotted.split(".").map(Number);
  const out: number[] = [a * 40 + b];
  for (const n of rest) {
    const chunk: number[] = [];
    let v = n;
    do {
      chunk.unshift(v & 0x7f);
      v = Math.floor(v / 128);
    } while (v > 0);
    for (let i = 0; i < chunk.length - 1; i++) chunk[i] |= 0x80;
    out.push(...chunk);
  }
  return tlv(0x06, Uint8Array.from(out));
}

function utcTime(ms: number): Uint8Array {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return tlv(0x17, utf8(`${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`));
}

const name = (cn: string) => seq(set(seq(oid("2.5.4.3"), tlv(0x0c, utf8(cn)))));

type Curve = "P-256" | "P-384";
const SIG_ALG: Record<Curve, { oid: string; hash: "SHA-256" | "SHA-384"; size: number }> = {
  "P-256": { oid: "1.2.840.10045.4.3.2", hash: "SHA-256", size: 32 },
  "P-384": { oid: "1.2.840.10045.4.3.3", hash: "SHA-384", size: 48 },
};

/** WebCrypto's raw r||s as the DER ECDSA-Sig-Value certificates carry. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  return seq(int(raw.slice(0, half)), int(raw.slice(half)));
}

export interface TestCert {
  der: Uint8Array;
  keys: CryptoKeyPair;
  curve: Curve;
  cn: string;
}

export interface CertOptions {
  cn: string;
  curve: Curve;
  issuer?: TestCert;
  ca?: boolean;
  /** Extension OIDs whose value is NULL (Apple's markers). */
  markers?: string[];
  notBefore?: number;
  notAfter?: number;
  /** Sign with this key instead of the issuer's (a broken chain). */
  signWith?: CryptoKey;
}

const YEAR = 365 * 24 * 60 * 60_000;

export async function makeCert(o: CertOptions): Promise<TestCert> {
  const keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: o.curve }, true, ["sign", "verify"])) as CryptoKeyPair;
  const spki = new Uint8Array((await crypto.subtle.exportKey("spki", keys.publicKey)) as ArrayBuffer);
  const issuerCurve = o.issuer?.curve ?? o.curve;
  const alg = SIG_ALG[issuerCurve];
  const algId = seq(oid(alg.oid));
  const extensions: Uint8Array[] = [];
  if (o.ca !== undefined) extensions.push(seq(oid("2.5.29.19"), bool(true), octets(o.ca ? seq(bool(true)) : seq())));
  for (const m of o.markers ?? []) extensions.push(seq(oid(m), octets(nul())));
  const now = Date.now();
  const tbs = seq(
    explicit(0, int(Uint8Array.of(2))),
    int(crypto.getRandomValues(new Uint8Array(8))),
    algId,
    name(o.issuer?.cn ?? o.cn),
    seq(utcTime(o.notBefore ?? now - YEAR), utcTime(o.notAfter ?? now + YEAR)),
    name(o.cn),
    spki,
    ...(extensions.length ? [explicit(3, seq(...extensions))] : []),
  );
  const signer = o.signWith ?? (o.issuer ?? { keys }).keys.privateKey;
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: alg.hash }, signer, tbs as Uint8Array<ArrayBuffer>));
  return { der: seq(tbs, algId, bits(rawToDer(raw))), keys, curve: o.curve, cn: o.cn };
}

const b64 = (der: Uint8Array) => btoa(String.fromCharCode(...der));

export interface TestChain {
  root: TestCert;
  intermediate: TestCert;
  leaf: TestCert;
  /** SHA-256 of the root (pass as rootSha256). */
  rootSha256: string;
  x5c: string[];
}

/** A chain shaped like Apple's: P-384 root and intermediate (a CA with Apple's marker), P-256 leaf with the App Store marker. */
export async function makeChain(over: { intermediate?: Partial<CertOptions>; leaf?: Partial<CertOptions> } = {}): Promise<TestChain> {
  const root = await makeCert({ cn: "Test Root CA - G3", curve: "P-384", ca: true });
  const intermediate = await makeCert({
    cn: "Test Worldwide Developer Relations CA - G6",
    curve: "P-384",
    issuer: root,
    ca: true,
    markers: [APPLE_INTERMEDIATE_MARKER],
    ...over.intermediate,
  });
  const leaf = await makeCert({ cn: "Test Prod ECC Mac App Store and iTunes Store Receipt Signing", curve: "P-256", issuer: intermediate, markers: [APPLE_LEAF_MARKER], ...over.leaf });
  const rootSha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", root.der as Uint8Array<ArrayBuffer>)));
  return { root, intermediate, leaf, rootSha256, x5c: [leaf, intermediate, root].map((c) => b64(c.der)) };
}

/** A compact JWS signed by the chain's leaf, with Apple's header shape. */
export async function signJws(payload: unknown, chain: TestChain, header: Record<string, unknown> = {}): Promise<string> {
  const h = base64UrlEncode(JSON.stringify({ alg: "ES256", x5c: chain.x5c, ...header }));
  const p = base64UrlEncode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chain.leaf.keys.privateKey, utf8(`${h}.${p}`)));
  return `${h}.${p}.${base64UrlEncode(sig)}`;
}
