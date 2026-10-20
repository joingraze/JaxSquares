// Verifies data the App Store signed (JWS with an x5c chain): App Store Server
// Notifications V2's signedPayload, the signedTransactionInfo and
// signedRenewalInfo inside it, and StoreKit 2's jwsRepresentation a device
// sends when it restores a purchase. Unlike a response from the App Store
// Server API (which arrives over TLS from Apple, signed in to with our key),
// these reach us from whoever POSTs them, so the signature is the only proof.
//
// The same checks Apple's own App Store Server Library makes (offline mode,
// SignedDataVerifier.verifyJWT):
//   1. the header's alg is ES256 and x5c holds exactly three certificates;
//   2. the third is Apple Root CA - G3, byte for byte (its SHA-256 is pinned
//      below; https://www.apple.com/certificateauthority/), and the chain is
//      unbroken: the intermediate's issuer is the root's subject and its
//      signature verifies with the root's key, the leaf's issuer is the
//      intermediate's subject and its signature verifies with the
//      intermediate's key;
//   3. the intermediate is a CA (basicConstraints) and carries Apple's
//      marker extension 1.2.840.113635.100.6.2.1; the leaf carries
//      1.2.840.113635.100.6.11.1 (App Store receipt signing);
//   4. all three certificates are valid at the payload's signedDate (or now
//      when it has none);
//   5. the JWS signature verifies with the leaf's P-256 key.
// Not done (Apple's library only does them in online mode): OCSP revocation
// checks. The caller checks the bundle id, product and environment.

import { base64ToBytes, base64UrlDecode, bytesToHex, utf8 } from "./encoding";
import { curveOf, ecdsaDerToRaw, hashOf, parseCertificate, type Certificate } from "./x509";

/** SHA-256 of Apple Root CA - G3 (DER). Apple publishes it at https://www.apple.com/certificateauthority/. */
export const APPLE_ROOT_CA_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";

/** Apple Worldwide Developer Relations intermediate marker (the intermediate must carry it). */
export const APPLE_INTERMEDIATE_MARKER = "1.2.840.113635.100.6.2.1";
/** App Store receipt signing marker (the leaf must carry it). */
export const APPLE_LEAF_MARKER = "1.2.840.113635.100.6.11.1";

export class AppleJwsError extends Error {
  constructor(public reason: string) {
    super(`App Store signature check failed: ${reason}`);
    this.name = "AppleJwsError";
  }
}

export interface VerifyOptions {
  /** Tests only: the root to trust instead of Apple Root CA - G3 (a SHA-256, lowercase hex). */
  rootSha256?: string;
  /** When there's no signedDate in the payload. */
  now?: number;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function keyOf(cert: Certificate) {
  const curve = curveOf(cert.curve);
  if (!curve) throw new AppleJwsError("unsupported key");
  return { curve, key: crypto.subtle.importKey("spki", cert.spki as Uint8Array<ArrayBuffer>, { name: "ECDSA", namedCurve: curve.name }, false, ["verify"]) };
}

/** `cert` was signed by `issuer`: names chain and the signature verifies with the issuer's key. */
async function issuedBy(cert: Certificate, issuer: Certificate): Promise<boolean> {
  if (!sameBytes(cert.issuer, issuer.subject)) return false;
  const hash = hashOf(cert.signatureAlgorithm);
  if (!hash) return false;
  const { curve, key } = keyOf(issuer);
  const sig = ecdsaDerToRaw(cert.signature, curve.size);
  return crypto.subtle.verify({ name: "ECDSA", hash }, await key, sig, cert.tbs as Uint8Array<ArrayBuffer>);
}

/**
 * Verifies an App Store JWS (see the top of this file) and returns its
 * payload. Throws AppleJwsError when anything doesn't check out.
 */
export async function verifyAppleJws<T = Record<string, unknown>>(jws: string, opts: VerifyOptions = {}): Promise<T> {
  const parts = typeof jws === "string" ? jws.split(".") : [];
  if (parts.length !== 3) throw new AppleJwsError("not a compact JWS");
  let header: { alg?: unknown; x5c?: unknown };
  let payload: T & { signedDate?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new AppleJwsError("unreadable header or payload");
  }
  if (header.alg !== "ES256") throw new AppleJwsError("alg isn't ES256");
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((c) => typeof c === "string")) throw new AppleJwsError("x5c isn't three certificates");

  let certs: Certificate[];
  try {
    certs = (x5c as string[]).map((c) => parseCertificate(base64ToBytes(c)));
  } catch {
    throw new AppleJwsError("unreadable certificate");
  }
  const [leaf, intermediate, root] = certs;

  if ((await sha256Hex(root.der as Uint8Array<ArrayBuffer>)) !== (opts.rootSha256 ?? APPLE_ROOT_CA_G3_SHA256)) {
    throw new AppleJwsError("not Apple's root certificate");
  }
  if (!intermediate.isCa) throw new AppleJwsError("intermediate isn't a CA");
  if (!intermediate.extensions.has(APPLE_INTERMEDIATE_MARKER)) throw new AppleJwsError("intermediate isn't Apple's");
  if (!leaf.extensions.has(APPLE_LEAF_MARKER)) throw new AppleJwsError("leaf isn't App Store signing");

  const at = typeof payload.signedDate === "number" && Number.isFinite(payload.signedDate) ? payload.signedDate : (opts.now ?? Date.now());
  for (const cert of certs) {
    if (at < cert.notBefore || at > cert.notAfter) throw new AppleJwsError("certificate not valid at signedDate");
  }
  if (!(await issuedBy(intermediate, root))) throw new AppleJwsError("intermediate not issued by the root");
  if (!(await issuedBy(leaf, intermediate))) throw new AppleJwsError("leaf not issued by the intermediate");

  const leafKey = keyOf(leaf);
  if (leafKey.curve.name !== "P-256") throw new AppleJwsError("leaf key isn't P-256");
  const signature = base64UrlDecode(parts[2]);
  if (signature.length !== 64) throw new AppleJwsError("bad signature length");
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await leafKey.key, signature, utf8(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new AppleJwsError("signature doesn't verify");
  return payload;
}
