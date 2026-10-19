// What each email says, as HTML and plain text from the same blocks. Pure:
// the caller passes the board's facts (notices.ts) and the links.
//
// Copy rules, as for pushes (worker/push/copy.ts): short, friendly, never
// about money. No amount, square price or "the rest" ever goes in an email;
// a host's free-text prize note may be quoted the way a push quotes it (it's
// validated money-free when it's saved). No betting words. Every email ends
// with why it came and a one-click unsubscribe.
//
// Look: a light, table-based layout with inline CSS (what email clients
// render), 560px wide at most, a dark brand band with Jax small, one volt
// button. Light only (`color-scheme: light`): clients that darken email
// invert it cleanly, and the dark band reads either way.

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export interface TeamLabel {
  /** Short label for tables: "KC". */
  abbr: string;
  /** Full name: "Chiefs". */
  name: string;
}

/** What every email has: the board, where Jax's picture lives, and the unsubscribe link. */
export interface EmailFrame {
  boardName: string;
  /** APP_ORIGIN, for the logo. */
  origin: string;
  unsubscribeUrl: string;
}

// ---- Blocks ----

type Block =
  | { kind: "p"; text: string; muted?: boolean }
  | { kind: "note"; text: string }
  | { kind: "score"; label: string; teamX: TeamLabel; teamY: TeamLabel; x: number; y: number }
  | { kind: "squares"; teamX: TeamLabel; teamY: TeamLabel; rows: { x: string; y: string }[]; more: number }
  | { kind: "rows"; title: string; rows: { label: string; value: string; mine?: boolean }[] };

interface Email {
  subject: string;
  /** The inbox preview line. */
  preheader: string;
  headline: string;
  blocks: Block[];
  cta: { label: string; url: string };
  /** A quiet line under the button (the confirmation email's "didn't ask for this?"). */
  aside?: string;
}

// ---- Palette and type (the app's pitch / volt / gold scales) ----

const C = {
  page: "#eef2ec",
  card: "#ffffff",
  band: "#0c1410",
  volt: "#c6f91f",
  ink: "#0f1a14",
  muted: "#46594d",
  subtle: "#586b5f",
  line: "#e3e9e2",
  tint: "#f2f5f0",
  gold: "#fff3d1",
  goldInk: "#8f5a00",
};
const SANS = "Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const DISPLAY = "'Bricolage Grotesque', Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
/** User text on one line: control and bidi characters out (they'd garble a subject or a table). */
const clean = (s: string) => s.replace(/[\p{Cc}‪-‮⁦-⁩]/gu, " ").replace(/\s+/g, " ").trim();

export const reasonLine = (boardName: string) => `You're getting this because you asked for JaxSquares email for ${clean(boardName)}.`;

function blockHtml(b: Block): string {
  switch (b.kind) {
    case "p":
      return `<p style="margin:0 0 16px;font:400 16px/1.5 ${SANS};color:${b.muted ? C.subtle : C.muted};">${escapeHtml(b.text)}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;padding:12px 14px;border-radius:12px;background:${C.gold};font:700 16px/1.4 ${SANS};color:${C.goldInk};">🏆 ${escapeHtml(b.text)}</p>`;
    case "score": {
      const cell = (t: TeamLabel, n: number) =>
        `<td align="center" width="50%" style="padding:6px 8px;"><div style="font:700 13px/1.3 ${SANS};color:${C.subtle};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(t.name)}</div>` +
        `<div style="font:800 40px/1.1 ${DISPLAY};color:${C.ink};">${n}</div></td>`;
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-radius:14px;background:${C.tint};">` +
        `<tr><td colspan="2" align="center" style="padding:12px 8px 0;font:800 12px/1.3 ${SANS};color:${C.subtle};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(b.label)}</td></tr>` +
        `<tr>${cell(b.teamX, b.x)}${cell(b.teamY, b.y)}</tr><tr><td colspan="2" style="height:8px;"></td></tr></table>`
      );
    }
    case "squares": {
      const th = (t: TeamLabel) =>
        `<th align="center" style="padding:10px 8px;border-bottom:1px solid ${C.line};font:800 13px/1.3 ${SANS};color:${C.subtle};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(t.abbr)}</th>`;
      const rows = b.rows
        .map((r, i) => {
          // A rule between rows, none under the last (the table's own border is there).
          const rule = i < b.rows.length - 1 || b.more > 0 ? `border-bottom:1px solid ${C.line};` : "";
          const td = (digits: string) => `<td align="center" style="padding:8px;${rule}font:800 22px/1.2 ${DISPLAY};color:${C.ink};">${escapeHtml(digits)}</td>`;
          return `<tr>${td(r.x)}${td(r.y)}</tr>`;
        })
        .join("");
      const more = b.more > 0 ? `<tr><td colspan="2" align="center" style="padding:10px 8px;font:600 14px/1.4 ${SANS};color:${C.subtle};">and ${b.more} more on the board</td></tr>` : "";
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid ${C.line};border-radius:14px;border-collapse:separate;">` +
        `<tr>${th(b.teamX)}${th(b.teamY)}</tr>${rows}${more}</table>`
      );
    }
    case "rows": {
      const rows = b.rows
        .map(
          (r) =>
            `<tr style="background:${r.mine ? C.gold : C.card};"><td width="34%" style="padding:10px 12px;border-top:1px solid ${C.line};font:800 14px/1.4 ${SANS};color:${C.ink};vertical-align:top;">${escapeHtml(r.label)}</td>` +
            `<td style="padding:10px 12px;border-top:1px solid ${C.line};font:${r.mine ? 700 : 400} 15px/1.4 ${SANS};color:${r.mine ? C.goldInk : C.muted};">${escapeHtml(r.value)}</td></tr>`,
        )
        .join("");
      return (
        `<p style="margin:8px 0 8px;font:800 12px/1.3 ${SANS};color:${C.subtle};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(b.title)}</p>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-bottom:1px solid ${C.line};">${rows}</table>`
      );
    }
  }
}

function blockText(b: Block): string {
  switch (b.kind) {
    case "p":
      return b.text;
    case "note":
      return `🏆 ${b.text}`;
    case "score":
      return `${b.label}: ${b.teamX.name} ${b.x}, ${b.teamY.name} ${b.y}`;
    case "squares":
      return [
        ...b.rows.map((r) => `- ${b.teamX.abbr} ${r.x} · ${b.teamY.abbr} ${r.y}`),
        ...(b.more > 0 ? [`- and ${b.more} more on the board`] : []),
      ].join("\n");
    case "rows":
      return [`${b.title}:`, ...b.rows.map((r) => `- ${r.label}: ${r.value}${r.mine ? " (you)" : ""}`)].join("\n");
  }
}

function render(frame: EmailFrame, email: Email): Rendered {
  const board = clean(frame.boardName);
  const reason = reasonLine(board);
  const button =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;"><tr>` +
    `<td style="border-radius:12px;background:${C.volt};"><a href="${escapeHtml(email.cta.url)}" style="display:inline-block;padding:14px 26px;border-radius:12px;font:800 16px/1.2 ${SANS};color:#060c09;text-decoration:none;">${escapeHtml(email.cta.label)}</a></td>` +
    `</tr></table>`;
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(clean(email.subject))}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};">${escapeHtml(email.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.card};border-radius:18px;overflow:hidden;">` +
    `<tr><td style="background:${C.band};padding:14px 24px;">` +
    `<img src="${escapeHtml(frame.origin)}/icons/icon-192.png" width="36" height="36" alt="Jax" style="display:inline-block;vertical-align:middle;border:0;border-radius:9px;">` +
    `<span style="display:inline-block;vertical-align:middle;margin-left:10px;font:800 19px/1 ${DISPLAY};color:${C.volt};letter-spacing:-0.3px;">JaxSquares</span></td></tr>` +
    `<tr><td style="padding:28px 24px 28px;">` +
    `<p style="margin:0 0 6px;font:800 12px/1.3 ${SANS};color:${C.subtle};text-transform:uppercase;letter-spacing:1px;">${escapeHtml(board)}</p>` +
    `<h1 style="margin:0 0 16px;font:800 28px/1.2 ${DISPLAY};color:${C.ink};letter-spacing:-0.5px;">${escapeHtml(email.headline)}</h1>` +
    email.blocks.map(blockHtml).join("") +
    button +
    (email.aside ? `<p style="margin:20px 0 0;font:400 14px/1.5 ${SANS};color:${C.subtle};">${escapeHtml(email.aside)}</p>` : "") +
    `</td></tr></table>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="padding:18px 24px 8px;font:400 13px/1.5 ${SANS};color:${C.subtle};">` +
    `${escapeHtml(reason)} <a href="${escapeHtml(frame.unsubscribeUrl)}" style="color:${C.muted};font-weight:700;text-decoration:underline;">Unsubscribe</a>` +
    `<br>JaxSquares · Football squares with friends</td></tr></table>` +
    `</td></tr></table></body></html>`;
  const text = [
    board,
    "",
    email.headline,
    "",
    ...email.blocks.flatMap((b) => [blockText(b), ""]),
    `${email.cta.label}: ${email.cta.url}`,
    ...(email.aside ? ["", email.aside] : []),
    "",
    "--",
    reason,
    `Unsubscribe: ${frame.unsubscribeUrl}`,
  ].join("\n");
  return { subject: clean(email.subject), html, text };
}

// ---- The emails ----

/** "Confirm your email for <board>": the double opt-in. Nothing else goes out until its link is opened. */
export function confirmEmail(frame: EmailFrame, confirmUrl: string): Rendered {
  const board = clean(frame.boardName);
  return render(frame, {
    subject: `Confirm your email for ${board}`,
    preheader: "One tap, and you'll hear when the numbers are drawn and if you win.",
    headline: "Confirm your email",
    blocks: [
      { kind: "p", text: `Tap below to get email about ${board}: when the numbers are drawn, if one of your squares wins, and the final results. Nothing else.` },
    ],
    cta: { label: "Confirm my email", url: confirmUrl },
    aside: "Didn't ask for this? Just ignore it: nothing more is sent unless you confirm. The link works for 7 days.",
  });
}

export interface NumbersFacts {
  teamX: TeamLabel;
  teamY: TeamLabel;
  /** My squares' digits ("3", or "3·8" on a 5x5 board), board order. */
  squares: { x: string; y: string }[];
  /** New numbers each quarter: the label of the draw shown ("Q1"). */
  freshLabel: string | null;
  /** How often new numbers come: each "quarter" (the default), or each "half" in a game of halves. */
  freshEach?: "quarter" | "half";
  /** Every score wins: the summary comes at the end instead of a win email. */
  everyScore: boolean;
  boardUrl: string;
}

/** Most squares listed; the rest are "and N more on the board". */
export const SQUARES_LISTED = 25;

export function numbersEmail(frame: EmailFrame, f: NumbersFacts): Rendered {
  const board = clean(frame.boardName);
  const n = f.squares.length;
  const blocks: Block[] = [
    { kind: "p", text: n === 1 ? `Here's your square on ${board}.` : `Here are your ${n} squares on ${board}.` },
    { kind: "squares", teamX: f.teamX, teamY: f.teamY, rows: f.squares.slice(0, SQUARES_LISTED), more: Math.max(0, n - SQUARES_LISTED) },
  ];
  if (f.freshLabel) {
    blocks.push({ kind: "p", text: `These are your ${f.freshLabel} numbers. Every ${f.freshEach ?? "quarter"} gets new ones, and the board shows them all.`, muted: true });
  }
  blocks.push({
    kind: "p",
    text: f.everyScore
      ? "When the game ends, we'll email you how many scores your squares won."
      : "We'll email you if one of your squares wins, and when the game ends.",
    muted: true,
  });
  return render(frame, {
    subject: `Numbers are in for ${board}`,
    preheader: n === 1 ? "Your square has its numbers. Take a look." : `Your ${n} squares have their numbers. Take a look.`,
    headline: "The numbers are in",
    blocks,
    cta: { label: n === 1 ? "See your square" : "See your squares", url: f.boardUrl },
  });
}

/** How a win reads: "Q1", "the half", "Q3", "the final". */
export function wonPhrase(periodKey: string, label: string): string {
  switch (periodKey) {
    case "q2":
      return "the half";
    case "final":
      return "the final";
    default:
      return label;
  }
}

const AT: Record<string, string> = { q1: "at the end of Q1", q2: "at halftime", q3: "at the end of Q3", final: "at the final whistle" };

export interface WinFacts {
  periodKey: string;
  /** "Q1", "Half", "Q3". */
  label: string;
  teamX: TeamLabel;
  teamY: TeamLabel;
  score: { x: number; y: number } | null;
  /** The host's prize note for the moment (never an amount), as a push quotes it. */
  note: string | null;
  boardUrl: string;
}

/** "You won Q1!": one of my squares won a quarter-end or the half. */
export function winEmail(frame: EmailFrame, f: WinFacts): Rendered {
  const board = clean(frame.boardName);
  const what = wonPhrase(f.periodKey, f.label);
  const blocks: Block[] = [{ kind: "p", text: `Your square hit ${AT[f.periodKey] ?? `at ${f.label}`} on ${board}.` }];
  if (f.score) blocks.push({ kind: "score", label: `${f.label} score`, teamX: f.teamX, teamY: f.teamY, x: f.score.x, y: f.score.y });
  const note = f.note ? clean(f.note) : "";
  if (note) blocks.push({ kind: "note", text: note });
  return render(frame, {
    subject: `You won ${what}! 🎉 ${board}`,
    preheader: f.score ? `${f.teamX.name} ${f.score.x}, ${f.teamY.name} ${f.score.y}. Your square hit.` : "Your square hit.",
    headline: `You won ${what}!`,
    blocks,
    cta: { label: "See the board", url: f.boardUrl },
  });
}

export interface FinalFacts {
  teamX: TeamLabel;
  teamY: TeamLabel;
  score: { x: number; y: number } | null;
  /** Each fixed moment's winners by name: "Maya", "Maya · reverse: Dre", "Open square". */
  moments: { label: string; winners: string; mine: boolean }[];
  /** Every score: how many each player's squares won, most first (names only). */
  scoreWins: { name: string; count: number; mine: boolean }[];
  everyScore: boolean;
  /** What I won: the fixed moments (wonPhrase) and how many score changes. */
  mine: { moments: string[]; scores: number };
  boardUrl: string;
}

/** "Jax", "Jax and Sam", "Jax, Sam and Lee". */
export function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const scoresWord = (n: number) => (n === 1 ? "1 score" : `${n} scores`);

/** The final results: the score, who won what by name, and what I won (never an amount). */
export function finalEmail(frame: EmailFrame, f: FinalFacts): Rendered {
  const board = clean(frame.boardName);
  const parts = [...(f.mine.scores > 0 ? [scoresWord(f.mine.scores)] : []), ...f.mine.moments];
  const won = parts.length > 0;
  const blocks: Block[] = [];
  if (f.score) blocks.push({ kind: "score", label: "Final", teamX: f.teamX, teamY: f.teamY, x: f.score.x, y: f.score.y });
  if (f.everyScore) {
    blocks.push({
      kind: "p",
      text:
        f.mine.scores > 0
          ? `Your squares won ${scoresWord(f.mine.scores)} on ${board}.`
          : `Your squares didn't win a score on ${board} this time.`,
    });
  } else if (!won) {
    blocks.push({ kind: "p", text: `Your squares didn't hit this time. Here's who won on ${board}.` });
  }
  if (f.moments.length > 0) blocks.push({ kind: "rows", title: "Winners", rows: f.moments.map((m) => ({ label: m.label, value: m.winners, mine: m.mine })) });
  if (f.scoreWins.length > 0) {
    blocks.push({ kind: "rows", title: "Scores won", rows: f.scoreWins.map((s) => ({ label: s.name, value: scoresWord(s.count), mine: s.mine })) });
  }
  return render(frame, {
    subject: won ? `You won ${joinWords(parts)}! 🎉 ${board} final results` : `Final results: ${board}`,
    preheader: f.score ? `Final: ${f.teamX.name} ${f.score.x}, ${f.teamY.name} ${f.score.y}. See who won.` : "The game's over. See who won.",
    headline: won ? `You won ${joinWords(parts)}!` : "That's a wrap",
    blocks,
    cta: { label: "See the whole board", url: f.boardUrl },
  });
}
