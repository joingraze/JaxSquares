// Test-only fixtures for the push module: a game, players, and real key material
// (VAPID keys made the way docs/push.md says, an RSA service account, a browser
// push subscription) so signing and encryption run for real.

import { derivePlayerIdSync } from "../../shared/playerId";
import type { Game } from "../../shared/types";
import type { Member } from "../db";

export const HOST = "host-client-0001";

/** Public player id of a test clientId. */
export const pid = (clientId: string): string => derivePlayerIdSync(clientId);

export function makeGame(over: Partial<Game> = {}): Game {
  return {
    id: "abc234",
    name: "Big Game Night",
    sport: "football",
    league: "custom",
    teamX: { name: "Chiefs", abbr: "KC" },
    teamY: { name: "Eagles", abbr: "PHI" },
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    periods: [
      { key: "q1", label: "Q1" },
      { key: "q2", label: "Half" },
      { key: "q3", label: "Q3" },
      { key: "final", label: "Final" },
    ],
    prizes: {},
    maxPerPlayer: 0,
    numbers: null,
    status: "locked",
    linkedEvent: null,
    hostPlayerId: pid(HOST),
    createdAt: 1_760_000_000_000,
    lockedAt: null,
    ...over,
  };
}

/** A player as push sees it (getMembers): public id plus the clientId its devices registered under. */
export function makePlayer(clientId: string, name: string, over: Partial<Member> = {}): Member {
  return { id: pid(clientId), clientId, name, color: "#38bdf8", emoji: "", joinedAt: 1_760_000_000_000, isHost: clientId === HOST, ...over };
}

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Same steps as the one-liner in docs/push.md. */
export async function makeVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", k.privateKey)) as JsonWebKey;
  const raw = (await crypto.subtle.exportKey("raw", k.publicKey)) as ArrayBuffer;
  return { publicKey: b64url(raw), privateKey: jwk.d! };
}

/** A browser's side of a push subscription: what it sends us, plus the private key to decrypt with. */
export async function makeBrowserSubscription(endpoint: string) {
  const keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { endpoint, p256dh: b64url(pub), auth: b64url(auth), privateKey: keys.privateKey, publicBytes: pub, authBytes: auth };
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** RFC 8291 aes128gcm decryption, as the browser does it. Returns the plaintext string. */
export async function decryptWebPush(body: Uint8Array, sub: Awaited<ReturnType<typeof makeBrowserSubscription>>): Promise<string> {
  const salt = body.slice(0, 16);
  const idLen = body[20];
  const serverPub = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const serverKey = await crypto.subtle.importKey("raw", serverPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // workers-types spells the ECDH param "$public"; the runtime (and Node) take "public".
  const ecdhParams = { name: "ECDH", public: serverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, sub.privateKey, 256));
  const enc = new TextEncoder();
  const ikm = await hkdf(sub.authBytes, ecdh, concat(enc.encode("WebPush: info\0"), sub.publicBytes, serverPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, ciphertext));
  // Last record: data, then a 0x02 delimiter, then zero padding.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  return new TextDecoder().decode(padded.slice(0, end));
}

function toPem(der: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

/** A Firebase-style service account JSON with a fresh RSA key, plus the public key to verify with. */
export async function makeServiceAccount(email = "firebase-adminsdk@jaxsquares-test.iam.gserviceaccount.com") {
  const keys = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey("pkcs8", keys.privateKey)) as ArrayBuffer;
  const json = JSON.stringify({
    type: "service_account",
    project_id: "jaxsquares-test",
    private_key_id: "kid-123",
    private_key: toPem(pkcs8),
    client_email: email,
    token_uri: "https://oauth2.googleapis.com/token",
  });
  return { json, publicKey: keys.publicKey };
}
