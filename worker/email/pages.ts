// The small pages an email's links open: confirming an address, and
// unsubscribing. Served by the Worker itself (no SPA), light or dark with the
// phone, and safe to open from a mail app:
// - a GET never changes anything: link scanners and previews open every link
//   in an email, and must not confirm an address (that would defeat the double
//   opt-in) or unsubscribe someone. The page's button POSTs.
// - the token is in the URL, so the page sends no Referer, can't be framed,
//   runs no script and only posts back to itself.

import { escapeHtml } from "./templates";

export const PAGE_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

const SUPPORT = "support@jaxsquares.com";

interface Action {
  label: string;
  /** POST here (a form), else a link. */
  post?: { action: string; fields?: Record<string, string> };
  href?: string;
  secondary?: boolean;
  testid: string;
}

interface Page {
  title: string;
  /** Paragraphs; `{board}` is replaced by the board's name in bold. */
  body: string[];
  actions: Action[];
  note?: string;
  /** data-state on the page's root, for screenshot harnesses and tests. */
  state: string;
}

const CSS = `
:root{color-scheme:light dark;--bg:#eef2ec;--card:#ffffff;--ink:#0f1a14;--muted:#46594d;--subtle:#586b5f;--line:rgb(16 42 26 / 0.12);--btn:#c6f91f;--btn-ink:#060c09;--btn2:#e3e9e2;--btn2-ink:#0f1a14;--band:#0c1410}
@media (prefers-color-scheme:dark){:root{--bg:#060c09;--card:#111a15;--ink:#f3f7f1;--muted:#a3b8ab;--subtle:#768d7f;--line:rgb(255 255 255 / 0.1);--btn2:#223029;--btn2-ink:#f3f7f1}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.5 Figtree,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
main{min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 16px 32px}
.card{width:100%;max-width:440px;background:var(--card);border-radius:22px;overflow:hidden;box-shadow:0 1px 0 var(--line),0 18px 40px -24px rgb(0 0 0 / 0.35)}
.band{display:flex;align-items:center;gap:10px;background:var(--band);padding:14px 20px;border-bottom:1px solid var(--line)}
.band img{width:34px;height:34px;border-radius:9px}
.band span{font:800 19px/1 "Bricolage Grotesque",Figtree,-apple-system,sans-serif;color:#c6f91f;letter-spacing:-0.3px}
.content{padding:24px 20px 22px}
h1{margin:0 0 12px;font:800 26px/1.2 "Bricolage Grotesque",Figtree,-apple-system,sans-serif;letter-spacing:-0.5px}
p{margin:0 0 14px;color:var(--muted)}
b{color:var(--ink)}
form{margin:0}
.actions{display:flex;flex-direction:column;gap:10px;margin-top:20px}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;padding:12px 18px;border:0;border-radius:14px;background:var(--btn);color:var(--btn-ink);font:800 17px/1.2 Figtree,-apple-system,sans-serif;text-decoration:none;cursor:pointer;-webkit-appearance:none;appearance:none}
.btn.secondary{background:var(--btn2);color:var(--btn2-ink);font-weight:700}
.note{margin:18px 0 0;font-size:14px;color:var(--subtle)}
`;

function actionHtml(a: Action): string {
  const cls = a.secondary ? "btn secondary" : "btn";
  if (a.post) {
    const fields = Object.entries(a.post.fields ?? {})
      .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
      .join("");
    return `<form method="post" action="${escapeHtml(a.post.action)}">${fields}<button type="submit" class="${cls}" data-testid="${a.testid}">${escapeHtml(a.label)}</button></form>`;
  }
  return `<a class="${cls}" href="${escapeHtml(a.href ?? "/")}" data-testid="${a.testid}">${escapeHtml(a.label)}</a>`;
}

function renderPage(p: Page, boardName: string | null): string {
  const board = `<b>${escapeHtml(boardName || "your board")}</b>`;
  const body = p.body.map((t) => `<p>${escapeHtml(t).replace("{board}", board)}</p>`).join("");
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
    `<meta name="robots" content="noindex"><title>${escapeHtml(p.title)} · JaxSquares</title><style>${CSS}</style></head>` +
    `<body><main><div class="card" data-testid="email-page" data-state="${p.state}">` +
    `<div class="band"><img src="/icons/icon-192.png" alt="Jax"><span>JaxSquares</span></div>` +
    `<div class="content"><h1>${escapeHtml(p.title)}</h1>${body}` +
    (p.actions.length > 0 ? `<div class="actions">${p.actions.map(actionHtml).join("")}</div>` : "") +
    (p.note ? `<p class="note">${escapeHtml(p.note)}</p>` : "") +
    `</div></div></main></body></html>`
  );
}

const boardLink = (gameId: string | null): Action => ({ label: gameId ? "Open the board" : "Open JaxSquares", href: gameId ? `/g/${gameId}` : "/", testid: "email-page-open", secondary: false });

export type ConfirmPageState = "ask" | "done" | "expired" | "unavailable";

/** /api/email/confirm: asks (GET), then says it's done (POST). */
export function confirmPage(state: ConfirmPageState, opts: { boardName?: string | null; gameId?: string | null; token?: string } = {}): string {
  const boardName = opts.boardName ?? null;
  switch (state) {
    case "ask":
      return renderPage(
        {
          state,
          title: "Confirm your email",
          body: ["Get email about {board} when the numbers are drawn, if one of your squares wins, and the final results. Nothing else."],
          actions: [{ label: "Confirm my email", post: { action: `/api/email/confirm?token=${encodeURIComponent(opts.token ?? "")}` }, testid: "email-confirm" }],
          note: "Didn't ask for this? Just close this page: nothing more is sent unless you confirm.",
        },
        boardName,
      );
    case "done":
      return renderPage(
        {
          state,
          title: "You're all set",
          body: ["We'll email you about {board} when the numbers are drawn and if you win, then the final results.", "Every email has a link to stop them."],
          actions: [boardLink(opts.gameId ?? null)],
        },
        boardName,
      );
    case "expired":
      return renderPage(
        {
          state,
          title: "This link has expired",
          body: [
            "It was already used, or it's more than 7 days old. If you're getting email for the board, you're all set.",
            "If not, add your email again from the board's notifications.",
          ],
          actions: [boardLink(null)],
        },
        boardName,
      );
    case "unavailable":
      return renderPage(
        { state, title: "Email isn't available right now", body: ["Try again in a little while."], actions: [boardLink(null)] },
        boardName,
      );
  }
}

export type UnsubscribePageState = "ask" | "board" | "all" | "invalid" | "unavailable";

/** /api/email/unsubscribe: asks which (GET), then confirms what stopped (POST). */
export function unsubscribePage(state: UnsubscribePageState, opts: { boardName?: string | null; token?: string } = {}): string {
  const boardName = opts.boardName ?? null;
  const action = `/api/email/unsubscribe?token=${encodeURIComponent(opts.token ?? "")}`;
  const all: Action = { label: "Unsubscribe from all JaxSquares email", post: { action, fields: { scope: "all" } }, secondary: true, testid: "email-unsubscribe-all" };
  switch (state) {
    case "ask":
      return renderPage(
        {
          state,
          title: "Unsubscribe",
          body: ["Stop getting email about {board}?"],
          actions: [{ label: "Unsubscribe from this board", post: { action, fields: { scope: "board" } }, testid: "email-unsubscribe-board" }, all],
        },
        boardName,
      );
    case "board":
      return renderPage(
        {
          state,
          title: "You're unsubscribed",
          body: ["You won't get more email about {board}. Your squares stay on the board."],
          actions: [{ ...all, label: "Stop all JaxSquares email too" }],
        },
        boardName,
      );
    case "all":
      return renderPage(
        {
          state,
          title: "You won't get any more email",
          body: ["JaxSquares won't email this address again, for any board."],
          actions: [],
          note: `Changed your mind? Write to ${SUPPORT}.`,
        },
        boardName,
      );
    case "invalid":
      return renderPage(
        {
          state,
          title: "This link doesn't work",
          body: [`It may have been cut off. Open the link from the email again, or write to ${SUPPORT} and we'll stop the email for you.`],
          actions: [boardLink(null)],
        },
        boardName,
      );
    case "unavailable":
      return renderPage(
        { state, title: "Email isn't available right now", body: [`Try again in a little while, or write to ${SUPPORT}.`], actions: [] },
        boardName,
      );
  }
}
