// A minimal DER / X.509 reader: just enough of a certificate to check an App
// Store JWS's x5c chain with WebCrypto (worker/payments/appleJws.ts). It reads
// the to-be-signed bytes, the signature, the issuer and subject names (as raw
// bytes, compared byte for byte), the validity window, the public key and the
// extensions. Anything malformed throws.

const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  OID: 0x06,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  SEQUENCE: 0x30,
  CONTEXT_0: 0xa0,
  CONTEXT_3: 0xa3,
} as const;

export const OID = {
  ecPublicKey: "1.2.840.10045.2.1",
  p256: "1.2.840.10045.3.1.7",
  p384: "1.3.132.0.34",
  ecdsaSha256: "1.2.840.10045.4.3.2",
  ecdsaSha384: "1.2.840.10045.4.3.3",
  ecdsaSha512: "1.2.840.10045.4.3.4",
  basicConstraints: "2.5.29.19",
} as const;

export class DerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerError";
  }
}

interface Tlv {
  tag: number;
  /** Offset of the tag byte. */
  start: number;
  /** Offset of the value. */
  valueStart: number;
  /** Offset just past the value. */
  end: number;
}

function readTlv(buf: Uint8Array, offset: number, limit = buf.length): Tlv {
  if (offset + 2 > limit) throw new DerError("Truncated DER");
  const tag = buf[offset];
  let len = buf[offset + 1];
  let p = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || p + n > limit) throw new DerError("Bad DER length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++];
  }
  const end = p + len;
  if (end > limit) throw new DerError("DER value runs past its parent");
  return { tag, start: offset, valueStart: p, end };
}

function children(buf: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let p = parent.valueStart; p < parent.end; ) {
    const t = readTlv(buf, p, parent.end);
    out.push(t);
    p = t.end;
  }
  return out;
}

function want(t: Tlv | undefined, tag: number, what: string): Tlv {
  if (!t || t.tag !== tag) throw new DerError(`Expected ${what}`);
  return t;
}

const bytesOf = (buf: Uint8Array, t: Tlv) => buf.slice(t.start, t.end);
const valueOf = (buf: Uint8Array, t: Tlv) => buf.slice(t.valueStart, t.end);

function oidOf(buf: Uint8Array, t: Tlv): string {
  const v = valueOf(buf, want(t, TAG.OID, "an OID"));
  if (v.length === 0) throw new DerError("Empty OID");
  const parts: number[] = [];
  const first = v[0];
  parts.push(first < 80 ? Math.floor(first / 40) : 2, first < 80 ? first % 40 : first - 80);
  let n = 0;
  for (let i = 1; i < v.length; i++) {
    n = n * 128 + (v[i] & 0x7f);
    if (!(v[i] & 0x80)) {
      parts.push(n);
      n = 0;
    }
  }
  return parts.join(".");
}

function timeOf(buf: Uint8Array, t: Tlv): number {
  const s = new TextDecoder().decode(valueOf(buf, t));
  let m: RegExpMatchArray | null;
  if (t.tag === TAG.UTC_TIME && (m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/))) {
    const yy = Number(m[1]);
    return Date.UTC(yy < 50 ? 2000 + yy : 1900 + yy, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  if (t.tag === TAG.GENERALIZED_TIME && (m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/))) {
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  throw new DerError("Bad certificate time");
}

export interface Certificate {
  /** The whole certificate (DER). */
  der: Uint8Array;
  /** The signed part (tbsCertificate, DER). */
  tbs: Uint8Array;
  /** The issuer's signature algorithm (OID). */
  signatureAlgorithm: string;
  /** The signature (for ECDSA: a DER ECDSA-Sig-Value). */
  signature: Uint8Array;
  /** Issuer and subject Names as raw DER, compared byte for byte. */
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number;
  notAfter: number;
  /** SubjectPublicKeyInfo (DER), for importKey("spki"). */
  spki: Uint8Array;
  /** The key's curve (OID) for an EC key, else null. */
  curve: string | null;
  /** basicConstraints says it's a CA. */
  isCa: boolean;
  /** Every extension's OID. */
  extensions: Set<string>;
}

/** Parses one DER certificate. */
export function parseCertificate(der: Uint8Array): Certificate {
  const root = readTlv(der, 0);
  if (root.tag !== TAG.SEQUENCE || root.end !== der.length) throw new DerError("Not a certificate");
  const [tbsT, algT, sigT] = children(der, root);
  want(tbsT, TAG.SEQUENCE, "tbsCertificate");
  const signatureAlgorithm = oidOf(der, children(der, want(algT, TAG.SEQUENCE, "signatureAlgorithm"))[0]);
  const bits = valueOf(der, want(sigT, TAG.BIT_STRING, "signature"));
  if (bits.length < 2 || bits[0] !== 0) throw new DerError("Bad signature bits");

  const fields = children(der, tbsT);
  let i = 0;
  if (fields[i]?.tag === TAG.CONTEXT_0) i++; // version
  want(fields[i++], TAG.INTEGER, "serialNumber");
  want(fields[i++], TAG.SEQUENCE, "signature");
  const issuer = bytesOf(der, want(fields[i++], TAG.SEQUENCE, "issuer"));
  const [nb, na] = children(der, want(fields[i++], TAG.SEQUENCE, "validity"));
  if (!nb || !na) throw new DerError("Bad validity");
  const subject = bytesOf(der, want(fields[i++], TAG.SEQUENCE, "subject"));
  const spkiT = want(fields[i++], TAG.SEQUENCE, "subjectPublicKeyInfo");
  const [keyAlgT] = children(der, spkiT);
  const keyAlg = children(der, want(keyAlgT, TAG.SEQUENCE, "key algorithm"));
  const curve = oidOf(der, keyAlg[0]) === OID.ecPublicKey && keyAlg[1]?.tag === TAG.OID ? oidOf(der, keyAlg[1]) : null;

  const extensions = new Set<string>();
  let isCa = false;
  const extT = fields.slice(i).find((f) => f.tag === TAG.CONTEXT_3);
  if (extT) {
    for (const ext of children(der, want(children(der, extT)[0], TAG.SEQUENCE, "extensions"))) {
      const parts = children(der, want(ext, TAG.SEQUENCE, "an extension"));
      const id = oidOf(der, parts[0]);
      extensions.add(id);
      if (id === OID.basicConstraints) {
        const value = parts[parts.length - 1];
        const inner = valueOf(der, want(value, TAG.OCTET_STRING, "an extension value"));
        const seq = readTlv(inner, 0);
        const first = children(inner, want(seq, TAG.SEQUENCE, "basicConstraints"))[0];
        isCa = first?.tag === TAG.BOOLEAN && inner[first.valueStart] !== 0;
      }
    }
  }

  return {
    der,
    tbs: bytesOf(der, tbsT),
    signatureAlgorithm,
    signature: bits.slice(1),
    issuer,
    subject,
    notBefore: timeOf(der, nb),
    notAfter: timeOf(der, na),
    spki: bytesOf(der, spkiT),
    curve,
    isCa,
    extensions,
  };
}

/** WebCrypto's name for an EC curve OID, with its coordinate size in bytes. */
export function curveOf(oid: string | null): { name: "P-256" | "P-384"; size: number } | null {
  if (oid === OID.p256) return { name: "P-256", size: 32 };
  if (oid === OID.p384) return { name: "P-384", size: 48 };
  return null;
}

/** The hash an ECDSA signature algorithm OID uses. */
export function hashOf(signatureAlgorithm: string): "SHA-256" | "SHA-384" | "SHA-512" | null {
  if (signatureAlgorithm === OID.ecdsaSha256) return "SHA-256";
  if (signatureAlgorithm === OID.ecdsaSha384) return "SHA-384";
  if (signatureAlgorithm === OID.ecdsaSha512) return "SHA-512";
  return null;
}

/** A DER ECDSA-Sig-Value (SEQUENCE { r, s }) as the raw r||s WebCrypto verifies, each padded to `size` bytes. */
export function ecdsaDerToRaw(sig: Uint8Array, size: number): Uint8Array<ArrayBuffer> {
  const seq = readTlv(sig, 0);
  if (seq.tag !== TAG.SEQUENCE || seq.end !== sig.length) throw new DerError("Bad ECDSA signature");
  const [r, s] = children(sig, seq);
  const out = new Uint8Array(size * 2);
  [r, s].forEach((t, k) => {
    let v = valueOf(sig, want(t, TAG.INTEGER, "an ECDSA integer"));
    while (v.length > 1 && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new DerError("ECDSA integer too long");
    out.set(v, k * size + (size - v.length));
  });
  return out;
}
