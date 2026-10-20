// @vitest-environment node
// Who gets which notice (pure planning), the sender's batching and retries,
// the link tokens and the settings check.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotifyEvent } from "../push/types";
import { emailSetup, senderOf, tokenSecretOf } from "./config";
import { planNotices } from "./notices";
import { RESEND_API, resendSender, type OutgoingEmail } from "./sender";
import { addressee, CLIENTS, everyScoreBoard, quartersBoard } from "./testFixtures";
import { emailKeyOf, readUnsubscribeToken, tokenHash, unsubscribeToken } from "./tokens";

const ana = addressee(CLIENTS.ana, "ana@gmail.com");
const ben = addressee(CLIENTS.ben, "ben@icloud.com");
const host = addressee(CLIENTS.host, "jordan@gmail.com");
/** Not on the board (removed by the host, say). */
const gone = addressee("gone-client-0009", "gone@gmail.com");
const everyone = [ana, ben, host, gone];

const plan = (state: ReturnType<typeof quartersBoard>, events: NotifyEvent[]) =>
  planNotices(state, everyone, events)
    .map((p) => `${p.to.email}:${p.key}`)
    .sort();

describe("planNotices", () => {
  it("emails the numbers to players holding squares, not the host who drew them, nor anyone off the board", () => {
    expect(plan(quartersBoard("locked"), [{ kind: "numbers-drawn", actor: host.playerId }])).toEqual(["ana@gmail.com:numbers", "ben@icloud.com:numbers"]);
  });

  it("emails a quarter or half win to its winners only", () => {
    expect(plan(quartersBoard("locked"), [{ kind: "winner", periodKey: "q1", label: "Q1", playerIds: [ana.playerId] }])).toEqual(["ana@gmail.com:q1"]);
  });

  it("sends no email per score on an every-score board (the summary comes at the end)", () => {
    const state = { ...everyScoreBoard(), game: { ...everyScoreBoard().game, status: "locked" as const } };
    expect(plan(state, [{ kind: "winner", periodKey: "s1", label: "Score 1", playerIds: [ana.playerId] }])).toEqual([]);
  });

  it("sends the results once the board is final, once per address however the events arrive", () => {
    const winnerFinal: NotifyEvent = { kind: "winner", periodKey: "final", label: "Final", playerIds: [ana.playerId] };
    expect(plan(quartersBoard("locked"), [winnerFinal])).toEqual([]);
    expect(plan(quartersBoard("final"), [winnerFinal, { kind: "final", actor: host.playerId }])).toEqual([
      "ana@gmail.com:final",
      "ben@icloud.com:final",
      "jordan@gmail.com:final",
    ]);
  });

  it("ignores events that never email", () => {
    for (const event of [{ kind: "board-full" }, { kind: "draw-reminder" }, { kind: "game-starting" }, { kind: "player-joined", name: "Sam" }] as NotifyEvent[]) {
      expect(plan(quartersBoard("locked"), [event])).toEqual([]);
    }
  });
});

describe("the Resend sender", () => {
  afterEach(() => vi.useRealTimers());

  const message = (i: number): OutgoingEmail => ({
    to: `player${i}@gmail.com`,
    subject: "Numbers are in\nBcc: someone@else.com",
    html: "<p>hi</p>",
    text: "hi",
    headers: { "List-Unsubscribe": "<https://jaxsquares.com/api/email/unsubscribe?token=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });

  function mockFetch(statuses: number[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response("{}", { status: statuses.shift() ?? 200 });
    });
    return { calls, fetcher: fetcher as unknown as typeof fetch };
  }

  it("sends one message to /emails, on one line, with its headers", async () => {
    const { calls, fetcher } = mockFetch([200]);
    expect(await resendSender("re_key", "JaxSquares <notices@jaxsquares.com>", fetcher).send([message(1)])).toEqual({ sent: 1, failed: 0 });
    expect(calls[0].url).toBe(`${RESEND_API}/emails`);
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("authorization")).toBe("Bearer re_key");
    expect(headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: "JaxSquares <notices@jaxsquares.com>",
      to: ["player1@gmail.com"],
      subject: "Numbers are in Bcc: someone@else.com",
      html: "<p>hi</p>",
      text: "hi",
      headers: message(1).headers,
    });
  });

  it("sends a big board in batches of 100", async () => {
    const { calls, fetcher } = mockFetch([]);
    const result = await resendSender("re_key", "x <a@b.co>", fetcher).send(Array.from({ length: 150 }, (_, i) => message(i)));
    expect(result).toEqual({ sent: 150, failed: 0 });
    expect(calls.map((c) => [c.url, (JSON.parse(String(c.init.body)) as unknown[]).length])).toEqual([
      [`${RESEND_API}/emails/batch`, 100],
      [`${RESEND_API}/emails/batch`, 50],
    ]);
  });

  it("retries a rate limit once with the same idempotency key, and gives up on a refusal", async () => {
    const { calls, fetcher } = mockFetch([429, 200]);
    expect(await resendSender("re_key", "x <a@b.co>", fetcher).send([message(1)])).toEqual({ sent: 1, failed: 0 });
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[0].init.headers).get("idempotency-key")).toBe(new Headers(calls[1].init.headers).get("idempotency-key"));

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const refused = mockFetch([422]);
    expect(await resendSender("re_key", "x <a@b.co>", refused.fetcher).send([message(1)])).toEqual({ sent: 0, failed: 1 });
    expect(refused.calls).toHaveLength(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("tokens", () => {
  const secret = "a-secret-that-is-long-enough";

  it("keys an address with the secret: the same address, the same key; another secret, another key", async () => {
    expect(await emailKeyOf(secret, "ana@gmail.com")).toBe(await emailKeyOf(secret, "ana@gmail.com"));
    expect(await emailKeyOf(secret, "ana@gmail.com")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await emailKeyOf(`${secret}!`, "ana@gmail.com")).not.toBe(await emailKeyOf(secret, "ana@gmail.com"));
    expect(await emailKeyOf(secret, "ben@gmail.com")).not.toBe(await emailKeyOf(secret, "ana@gmail.com"));
  });

  it("reads back only the unsubscribe tokens it signed", async () => {
    const key = await emailKeyOf(secret, "ana@gmail.com");
    const token = await unsubscribeToken(secret, "k7m2px", key);
    expect(await readUnsubscribeToken(secret, token)).toEqual({ gameId: "k7m2px", emailKey: key });
    expect(await readUnsubscribeToken("another-long-secret-value", token)).toBeNull();
    // Another board's token can't be made from this one.
    expect(await readUnsubscribeToken(secret, token.replace("k7m2px", "abc234"))).toBeNull();
    for (const bad of ["", "nope", `${token}x`, 42, null]) expect(await readUnsubscribeToken(secret, bad)).toBeNull();
  });

  it("stores a confirmation token only as a hash", async () => {
    const hash = await tokenHash("t".repeat(43));
    expect(hash).not.toContain("tttt");
    expect(hash).toBe(await tokenHash("t".repeat(43)));
  });
});

describe("settings", () => {
  it("reads the sender, with JaxSquares as the name when only an address is given", () => {
    expect(senderOf("notices@jaxsquares.com")).toBe("JaxSquares <notices@jaxsquares.com>");
    expect(senderOf("JaxSquares <notices@jaxsquares.com>")).toBe("JaxSquares <notices@jaxsquares.com>");
    expect(senderOf('"Jax at JaxSquares" <notices@jaxsquares.com>')).toBe("Jax at JaxSquares <notices@jaxsquares.com>");
    for (const bad of [undefined, "", "notices", "JaxSquares <notices>", "a@b.com\r\nBcc: x@y.com"]) expect(senderOf(bad)).toBeNull();
  });

  it("is off unless the key, the sender and a long enough secret are all set", () => {
    const full = { RESEND_API_KEY: "re_1", EMAIL_FROM: "notices@jaxsquares.com", EMAIL_TOKEN_SECRET: "0123456789abcdef" };
    expect(emailSetup(full)).toEqual({ apiKey: "re_1", from: "JaxSquares <notices@jaxsquares.com>", secret: full.EMAIL_TOKEN_SECRET, origin: "https://jaxsquares.com" });
    expect(emailSetup({ ...full, RESEND_API_KEY: " " })).toBeNull();
    expect(emailSetup({ ...full, EMAIL_FROM: "" })).toBeNull();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(emailSetup({ ...full, EMAIL_TOKEN_SECRET: "short" })).toBeNull();
    expect(tokenSecretOf({ EMAIL_TOKEN_SECRET: "short" })).toBeNull();
    errors.mockRestore();
  });
});
