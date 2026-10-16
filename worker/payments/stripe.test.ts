// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToHex } from "./encoding";
import {
  STRIPE_API_VERSION,
  boardIdempotencyKey,
  createBoardPaymentIntent,
  formEncode,
  hmacSha256,
  signStripePayload,
  verifyStripeSignature,
} from "./stripe";

const SECRET = "whsec_test_secret";
const NOW = 1_760_000_000;
const PAYLOAD = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } });

describe("hmacSha256", () => {
  it("matches RFC 4231 test case 2", async () => {
    expect(bytesToHex(await hmacSha256("Jefe", "what do ya want for nothing?"))).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("verifyStripeSignature", () => {
  it("accepts a valid signature", async () => {
    const header = await signStripePayload(PAYLOAD, SECRET, NOW);
    expect(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW + 10)).toBe("ok");
  });

  it("accepts Stripe's full header shape (extra v0 scheme, spaces)", async () => {
    const signed = await signStripePayload(PAYLOAD, SECRET, NOW);
    const v1 = signed.split("v1=")[1];
    const header = `t=${NOW}, v1=${v1}, v0=${"0".repeat(64)}`;
    expect(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW)).toBe("ok");
  });

  it("accepts when any v1 matches (secret being rolled)", async () => {
    const oldSig = (await signStripePayload(PAYLOAD, "whsec_old", NOW)).split("v1=")[1];
    const newSig = (await signStripePayload(PAYLOAD, SECRET, NOW)).split("v1=")[1];
    expect(await verifyStripeSignature(PAYLOAD, `t=${NOW},v1=${oldSig},v1=${newSig}`, SECRET, NOW)).toBe("ok");
  });

  it("rejects a tampered payload", async () => {
    const header = await signStripePayload(PAYLOAD, SECRET, NOW);
    const tampered = PAYLOAD.replace("pi_1", "pi_2");
    expect(await verifyStripeSignature(tampered, header, SECRET, NOW)).toBe("mismatch");
  });

  it("rejects a signature made with another secret", async () => {
    const header = await signStripePayload(PAYLOAD, "whsec_attacker", NOW);
    expect(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW)).toBe("mismatch");
  });

  it("rejects a re-signed timestamp (the signature covers t)", async () => {
    const sig = (await signStripePayload(PAYLOAD, SECRET, NOW - 3600)).split("v1=")[1];
    expect(await verifyStripeSignature(PAYLOAD, `t=${NOW},v1=${sig}`, SECRET, NOW)).toBe("mismatch");
  });

  it("rejects a stale timestamp beyond 5 minutes, and one too far in the future", async () => {
    const header = await signStripePayload(PAYLOAD, SECRET, NOW);
    expect(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW + 300)).toBe("ok");
    expect(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW + 301)).toBe("stale");
    expect(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW - 301)).toBe("stale");
  });

  it("rejects missing and malformed headers", async () => {
    expect(await verifyStripeSignature(PAYLOAD, null, SECRET, NOW)).toBe("missing");
    expect(await verifyStripeSignature(PAYLOAD, "t=1", "", NOW)).toBe("missing");
    expect(await verifyStripeSignature(PAYLOAD, `t=${NOW}`, SECRET, NOW)).toBe("malformed");
    expect(await verifyStripeSignature(PAYLOAD, "v1=abcd", SECRET, NOW)).toBe("malformed");
    expect(await verifyStripeSignature(PAYLOAD, `t=${NOW},v1=not-hex`, SECRET, NOW)).toBe("malformed");
    expect(await verifyStripeSignature(PAYLOAD, `t=${NOW},v1=abcd`, SECRET, NOW)).toBe("mismatch");
  });
});

describe("formEncode", () => {
  it("encodes nested params the way Stripe expects", () => {
    expect(
      formEncode({ amount: 499, automatic_payment_methods: { enabled: true }, metadata: { game_id: "ab c" }, skip: undefined }),
    ).toBe("amount=499&automatic_payment_methods%5Benabled%5D=true&metadata%5Bgame_id%5D=ab%20c");
  });
});

describe("createBoardPaymentIntent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs a form-encoded intent with wallets enabled, game metadata and the idempotency key", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: "pi_1", client_secret: "pi_1_secret_x", status: "requires_payment_method" }));
    vi.stubGlobal("fetch", fetchMock);
    const intent = await createBoardPaymentIntent("sk_test_1", {
      gameId: "g1",
      amountCents: 499,
      currency: "usd",
      idempotencyKey: boardIdempotencyKey("g1", 499, "usd"),
    });
    expect(intent.client_secret).toBe("pi_1_secret_x");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk_test_1");
    expect(headers["idempotency-key"]).toBe("board-g1-499usd");
    expect(headers["stripe-version"]).toBe(STRIPE_API_VERSION);
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      amount: "499",
      currency: "usd",
      "automatic_payment_methods[enabled]": "true",
      "automatic_payment_methods[allow_redirects]": "never",
      description: "JaxSquares board",
      "metadata[game_id]": "g1",
      "metadata[product]": "board",
    });
  });

  it("surfaces Stripe's error message and status", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: { message: "Invalid API Key", code: "api_key_invalid" } }, { status: 401 }));
    await expect(
      createBoardPaymentIntent("sk_bad", { gameId: "g1", amountCents: 499, currency: "usd", idempotencyKey: "k" }),
    ).rejects.toMatchObject({ name: "StripeApiError", status: 401, code: "api_key_invalid", message: "Invalid API Key" });
  });
});

describe("boardIdempotencyKey", () => {
  it("changes with price and when replacing a dead intent", () => {
    expect(boardIdempotencyKey("g1", 499, "usd")).toBe("board-g1-499usd");
    expect(boardIdempotencyKey("g1", 999, "usd")).toBe("board-g1-999usd");
    expect(boardIdempotencyKey("g1", 499, "usd", "pi_old")).toBe("board-g1-499usd-after-pi_old");
  });
});
