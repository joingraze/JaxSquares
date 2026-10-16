// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PLAYER_ID_LENGTH, derivePlayerId, derivePlayerIdSync, isPlayerId, sha256 } from "./playerId";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const enc = (s: string) => new TextEncoder().encode(s);

/** The spec, spelled out with Node's own SHA-256. */
const reference = (clientId: string) =>
  createHash("sha256").update(`jaxsquares:player:${clientId}`).digest("base64url").slice(0, PLAYER_ID_LENGTH);

describe("sha256 (sync fallback)", () => {
  it("matches the FIPS test vectors", () => {
    expect(hex(sha256(enc("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(sha256(enc("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(sha256(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("matches node:crypto at every padding boundary", () => {
    for (let n = 0; n < 200; n++) {
      const data = new Uint8Array(n).map((_, i) => (i * 31 + n) & 0xff);
      expect(hex(sha256(data))).toBe(createHash("sha256").update(data).digest("hex"));
    }
  });
});

describe("player ids", () => {
  const ids = ["f3b6c1d2-8a4e-4c1b-9d7f-2e5a6b7c8d9e", "client-jax-001", "x".repeat(64), "ümlaut-🏈-id"];

  it("follow the spec: base64url(SHA-256(prefix + clientId)), 22 chars", async () => {
    for (const id of ids) {
      const pid = await derivePlayerId(id);
      expect(pid).toBe(reference(id));
      expect(pid).toHaveLength(22);
      expect(isPlayerId(pid)).toBe(true);
    }
  });

  it("are identical from WebCrypto and the sync fallback", async () => {
    for (const id of ids) expect(derivePlayerIdSync(id)).toBe(await derivePlayerId(id));
  });

  it("fall back to the sync digest without crypto.subtle", async () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      expect(await derivePlayerId("client-jax-001")).toBe(reference("client-jax-001"));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never contain the clientId and differ per device", async () => {
    const a = await derivePlayerId("client-aaaa-0001");
    const b = await derivePlayerId("client-aaaa-0002");
    expect(a).not.toBe(b);
    expect(a).not.toContain("client");
  });

  it("isPlayerId rejects anything that isn't 22 base64url chars", () => {
    expect(isPlayerId("abc")).toBe(false);
    expect(isPlayerId("a".repeat(23))).toBe(false);
    expect(isPlayerId("a".repeat(21) + "+")).toBe(false);
    expect(isPlayerId(42)).toBe(false);
  });
});
