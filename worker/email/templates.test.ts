// @vitest-environment node
// Every email template and link page, rendered from boards that have amounts
// set, then scanned: no amount, no betting word, every email with its "why"
// line, an unsubscribe link (and its RFC 8058 headers) and a plain-text part,
// and user text escaped.
import { describe, expect, it } from "vitest";
import { confirmPage, unsubscribePage, type ConfirmPageState, type UnsubscribePageState } from "./pages";
import { renderAll } from "./testFixtures";

const BOARD = `Smith & "Jones" <Squares>`;
const BANNED = /\$|\bbets?\b|\bbetting\b|wager|gambl|\bpot\b|payouts?|pay-?outs?\b|buy-?ins?\b|\bodds\b|\bstakes?\b|jackpot|\bcash\b|\bmoney\b|\d+\.\d\d/i;
/** The fixture boards' square price and prize amounts (shared/... testFixtures AMOUNTS and the by-kind ones). */
const AMOUNTS = /1,?234|4,?321|\b777\b|\b37\b|\b611\b|\b299\b/;

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const noLinks = (s: string) => s.replace(/https?:\/\/[^\s"<>]+/g, "");
/** What a reader sees: no styles, tags or links, entities decoded. */
const visible = (html: string) => decode(noLinks(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")));

describe("email templates", async () => {
  const all = await renderAll();

  it("renders each one", () => {
    expect(all.map((r) => r.name)).toEqual([
      "confirm",
      "numbers",
      "numbers-fresh",
      "numbers-every-score",
      "win-q1",
      "win-q3",
      "final-won",
      "final-no-win",
      "final-every-score",
    ]);
  });

  it.each(all.map((r) => [r.name, r.email] as const))("%s: says why it came, unsubscribes in one click, has a text part", (_name, email) => {
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.subject).toContain(BOARD);
    expect(email.text).toContain(`You're getting this because you asked for JaxSquares email for ${BOARD}.`);
    expect(visible(email.html)).toContain(`You're getting this because you asked for JaxSquares email for ${BOARD}.`);
    const unsubscribe = /^<(https:\/\/jaxsquares\.com\/api\/email\/unsubscribe\?token=k7m2px\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43})>$/.exec(email.headers["List-Unsubscribe"])?.[1];
    expect(unsubscribe).toBeTruthy();
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(email.text).toContain(`Unsubscribe: ${unsubscribe}`);
    expect(email.html).toContain(`href="${unsubscribe}"`);
    expect(email.html).toContain('src="https://jaxsquares.com/icons/icon-192.png"');
    expect(email.html).toMatch(/^<!doctype html>/);
    // The board's name is escaped, never markup.
    expect(email.html).toContain("Smith &amp; &quot;Jones&quot; &lt;Squares&gt;");
    expect(email.html).not.toContain("<Squares>");
  });

  it.each(all.map((r) => [r.name, r.email] as const))("%s: never an amount, never a betting word", (_name, email) => {
    for (const part of [email.subject, email.text, visible(email.html), noLinks(email.html)]) {
      expect(part).not.toMatch(BANNED);
      expect(part).not.toMatch(AMOUNTS);
    }
  });

  const text = (name: string) => all.find((r) => r.name === name)!.email;

  it("lists my squares and their numbers when the numbers are drawn", () => {
    const e = text("numbers");
    expect(e.subject).toBe(`Numbers are in for ${BOARD}`);
    expect(e.text).toContain("Here are your 3 squares on");
    expect(e.text).toContain("- KC 3 · PHI 7\n- KC 8 · PHI 2\n- KC 0 · PHI 0");
    expect(e.text).toContain("We'll email you if one of your squares wins, and when the game ends.");
    expect(e.text).toContain("See your squares: https://jaxsquares.com/g/k7m2px");
    expect(text("numbers-fresh").text).toContain("- KC 3·8 · PHI 7·2");
    expect(text("numbers-fresh").text).toContain("These are your Q1 numbers.");
    expect(text("numbers-every-score").text).toContain("When the game ends, we'll email you how many scores your squares won.");
  });

  it("says which moment I won, with the score and the host's note", () => {
    const q1 = text("win-q1");
    expect(q1.subject).toBe(`You won Q1! 🎉 ${BOARD}`);
    expect(q1.text).toContain("Your square hit at the end of Q1 on");
    expect(q1.text).toContain("Q1 score: Chiefs 13, Eagles 17");
    expect(q1.text).toContain("🏆 Loser buys wings");
    expect(text("win-q3").text).not.toContain("🏆");
  });

  it("names every winner in the final results, and what I won", () => {
    const won = text("final-won");
    expect(won.subject).toBe(`You won Q1, Q3 and the final! 🎉 ${BOARD} final results`);
    expect(won.text).toContain("Final: Chiefs 33, Eagles 27");
    expect(won.text).toContain("- Q1: Ana (you)\n- Half: Ben\n- Q3: Ana (you)\n- Final: Ana · reverse: open square (you)");
    const lost = text("final-no-win");
    expect(lost.subject).toBe(`Final results: ${BOARD}`);
    expect(lost.text).toContain("That's a wrap");
    expect(lost.text).toContain("Your squares didn't hit this time.");
    const every = text("final-every-score");
    expect(every.subject).toBe(`You won 4 scores and the final! 🎉 ${BOARD} final results`);
    expect(every.text).toContain("Your squares won 4 scores on");
    expect(every.text).toContain("- Ana: 4 scores (you)\n- Ben: 1 score");
  });

  it("asks to confirm, and says what happens if you didn't ask", () => {
    const e = text("confirm");
    expect(e.subject).toBe(`Confirm your email for ${BOARD}`);
    expect(e.text).toContain(`Confirm my email: https://jaxsquares.com/api/email/confirm?token=${"t".repeat(43)}`);
    expect(e.text).toContain("Didn't ask for this? Just ignore it");
  });
});

describe("link pages", () => {
  const confirmStates: ConfirmPageState[] = ["ask", "done", "expired", "unavailable"];
  const unsubscribeStates: UnsubscribePageState[] = ["ask", "board", "all", "invalid", "unavailable"];
  const pages = [
    ...confirmStates.map((s) => [`confirm ${s}`, confirmPage(s, { boardName: BOARD, gameId: "k7m2px", token: "t".repeat(43) })] as const),
    ...unsubscribeStates.map((s) => [`unsubscribe ${s}`, unsubscribePage(s, { boardName: BOARD, token: "k7m2px.key.sig" })] as const),
  ];

  it.each(pages)("%s: no betting words, the board's name escaped, buttons that post", (_name, html) => {
    expect(visible(html)).not.toMatch(BANNED);
    expect(html).not.toContain("<Squares>");
    expect(html).not.toMatch(/<script/i);
    for (const form of html.match(/<form[^>]*>/g) ?? []) expect(form).toMatch(/method="post"/);
  });

  it("asks before it confirms or unsubscribes (a GET page only offers buttons)", () => {
    expect(confirmPage("ask", { boardName: BOARD, token: "abc" })).toContain('action="/api/email/confirm?token=abc"');
    const ask = unsubscribePage("ask", { boardName: BOARD, token: "a.b.c" });
    expect(ask).toContain('name="scope" value="board"');
    expect(ask).toContain('name="scope" value="all"');
  });
});
