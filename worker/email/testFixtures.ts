// Test-only: boards that exercise every email template (amounts set on all of
// them, so a test can prove none leaks), and every template rendered from
// them through the real composer. Used by templates.test.ts.

import { derivePlayerIdSync } from "../../shared/playerId";
import type { GameFormat, GameState, NumberDraw, Player, Score, Square } from "../../shared/types";
import type { EmailSetup } from "./config";
import { composeConfirmation, composeNotice, type Addressee, type NoticeKey } from "./notices";
import type { OutgoingEmail } from "./sender";

export const SETUP: EmailSetup = {
  apiKey: "re_test",
  from: "JaxSquares <notices@jaxsquares.com>",
  secret: "fixture-secret-0123456789abcdef",
  origin: "https://jaxsquares.com",
};

const pid = derivePlayerIdSync;
export const CLIENTS = { host: "host-client-0001", ana: "ana-client-0002", ben: "ben-client-0003", priya: "priya-client-0004" };
/** Amounts on every fixture board: none may show up in an email. */
export const AMOUNTS = { price: 37, square: 1234, final: 4321, reverse: 777 };

const player = (client: string, name: string, emoji: string): Player => ({
  id: pid(client),
  name,
  color: "#38b6ff",
  emoji,
  joinedAt: 1_760_000_000_000,
  isHost: client === CLIENTS.host,
});

const PLAYERS = [player(CLIENTS.host, "Jordan", "🦊"), player(CLIENTS.ana, "Ana", "🐐"), player(CLIENTS.ben, "Ben", "🐻"), player(CLIENTS.priya, "Priya", "🌮")];

const square = (client: string, row: number, col: number): Square => ({ row, col, playerId: pid(client), claimedAt: 1_760_000_000_000 });
const score = (periodKey: string, scoreX: number, scoreY: number, label?: string): Score => ({ periodKey, scoreX, scoreY, source: "host", updatedAt: 1_760_000_000_000, ...(label ? { label } : {}) });

/** 10x10: column i holds X_DIGITS[i], row i holds Y_DIGITS[i]. */
const X_DIGITS = [3, 8, 1, 6, 0, 9, 4, 7, 2, 5];
const Y_DIGITS = [7, 2, 9, 4, 0, 5, 1, 8, 3, 6];
const DRAW_10: NumberDraw = { x: X_DIGITS.map((d) => [d]), y: Y_DIGITS.map((d) => [d]) };
const DRAW_5: NumberDraw = { x: [[3, 8], [1, 6], [0, 9], [4, 7], [2, 5]], y: [[7, 2], [9, 4], [0, 5], [1, 8], [3, 6]] };

const quarters: GameFormat = {
  periods: "quarters",
  reverse: true,
  boardSize: 100,
  freshNumbers: false,
  unit: "$",
  squarePrice: AMOUNTS.price,
  justForFun: false,
  rules: [
    { moment: "q1", square: { amount: AMOUNTS.square, note: "Loser buys wings" }, reverse: null },
    { moment: "q2", square: { amount: AMOUNTS.square, note: "" }, reverse: null },
    { moment: "q3", square: { amount: AMOUNTS.square, note: "" }, reverse: null },
    { moment: "final", square: { amount: AMOUNTS.final, note: "Winner picks the playlist" }, reverse: { amount: AMOUNTS.reverse, note: "" } },
  ],
};

function base(over: Partial<GameState["game"]>, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "k7m2px",
      // HTML-looking on purpose: every template must escape it.
      name: `Smith & "Jones" <Squares>`,
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: quarters,
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": DRAW_10 },
      status: "locked",
      linkedEvent: null,
      startsAt: null,
      hostPlayerId: pid(CLIENTS.host),
      createdAt: 1_760_000_000_000,
      lockedAt: 1_760_000_100_000,
      paid: true,
      ...over,
    },
    players: PLAYERS,
    // Ana: (0,0) = KC 3 / PHI 7 and (1,1) = KC 8 / PHI 2 and (4,4); Ben (2,2); Priya (3,3).
    squares: [square(CLIENTS.ana, 0, 0), square(CLIENTS.ana, 1, 1), square(CLIENTS.ana, 4, 4), square(CLIENTS.ben, 2, 2), square(CLIENTS.priya, 3, 3)],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 7,
    ...rest,
  } as GameState;
}

/** Q1 13-17 (Ana's KC 3 / PHI 7), Half 21-19 (Ben's 1/9), Q3 28-22 (Ana's 8/2), Final 33-27 (Ana again; its reverse, 7/3, is an open square). */
export const quartersBoard = (status: "locked" | "final" = "final") =>
  base({ status }, { scores: [score("q1", 13, 17), score("q2", 21, 19), score("q3", 28, 22), score("final", 33, 27)] });

/** Fresh numbers each quarter on a 5x5 board: Q1's numbers go in the numbers email. */
export const freshBoard = () =>
  base({
    format: { ...quarters, boardSize: 25, freshNumbers: true, reverse: false, rules: quarters.rules!.map((r) => ({ ...r, reverse: null })) },
    numbers: { q1: DRAW_5, q2: DRAW_5, q3: DRAW_5, final: DRAW_5 },
  });

/** Every score wins (amounts by score type), plus the final taking the rest. Ana wins 4 scores and the final, Ben 1 score. */
export const everyScoreBoard = () =>
  base(
    {
      status: "final",
      format: {
        periods: "every-score",
        reverse: false,
        boardSize: 100,
        freshNumbers: false,
        unit: "$",
        squarePrice: AMOUNTS.price,
        justForFun: false,
        rules: [
          { moment: "score", square: { amount: AMOUNTS.square, note: "", byKind: { touchdown: AMOUNTS.square, fieldGoal: 611, extraPoint: 299, twoPoint: 611, safety: 611 } }, reverse: null },
          { moment: "final", square: { amount: null, note: "", rest: true }, reverse: null },
        ],
      },
      periods: [{ key: "final", label: "Final" }],
    },
    {
      scores: [
        score("s1", 3, 7, "Score 1"),
        score("s2", 13, 7, "Score 2"),
        score("s3", 13, 17, "Score 3"),
        score("s4", 21, 19, "Score 4"),
        score("s5", 23, 27, "Score 5"),
        score("final", 23, 27),
      ],
    },
  );

export const addressee = (client: string, email: string): Addressee => ({
  id: `es_${client}`,
  client_id: client,
  email,
  email_key: "a".repeat(32),
  playerId: pid(client),
});

const ana = addressee(CLIENTS.ana, "ana@gmail.com");
const priya = addressee(CLIENTS.priya, "priya@outlook.com");

/** Every template, rendered through the real composer. */
export async function renderAll(): Promise<{ name: string; email: OutgoingEmail }[]> {
  const notice = (state: GameState, to: Addressee, key: NoticeKey) => composeNotice({ to, key }, state, SETUP);
  return [
    { name: "confirm", email: await composeConfirmation(SETUP, base({}), { email: ana.email, emailKey: ana.email_key }, "t".repeat(43)) },
    { name: "numbers", email: await notice(base({}), ana, "numbers") },
    { name: "numbers-fresh", email: await notice(freshBoard(), ana, "numbers") },
    { name: "numbers-every-score", email: await notice(everyScoreBoard(), ana, "numbers") },
    { name: "win-q1", email: await notice(quartersBoard("locked"), ana, "q1") },
    { name: "win-q3", email: await notice(quartersBoard("locked"), ana, "q3") },
    { name: "final-won", email: await notice(quartersBoard(), ana, "final") },
    { name: "final-no-win", email: await notice(quartersBoard(), priya, "final") },
    { name: "final-every-score", email: await notice(everyScoreBoard(), ana, "final") },
  ];
}
