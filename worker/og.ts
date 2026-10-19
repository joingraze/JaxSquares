// Per-game link previews: GET /g/:id serves the SPA's index.html with Open
// Graph / Twitter tags rewritten so an invite pasted into iMessage, WhatsApp or
// Slack shows "Join <board name> on JaxSquares" instead of a generic card.
//
// The same page also carries the board's GameState (the public one GET
// /api/games/:id returns) in <script type="application/json" id="jx-boot">,
// so a friend opening the invite sees the board without waiting for that GET
// (src/lib/live.ts takes it once, for this board only).
//
// The board's TV view (/g/:id/tv) and printable board (/g/:id/print) are the
// same page (the SPA routes them) with a preview that says what they are.
// Never an amount: the status line is squares left, numbers drawn or the
// final score. A finished board's preview is its recap: "See who won <board>"
// with "Final: Chiefs 27, Bills 24 · 4 winners" (how many players won).

import { boardPeriods, resolveResults, squaresLeft, totalSquares, winCounts } from "../shared/squares";
import { BOOT_STATE_ID, type GameState } from "../shared/types";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export interface InviteMeta {
  title: string;
  description: string;
  url: string;
  image: string;
}

const teamLabel = (t: { name: string; abbr?: string }) => t.name || t.abbr || "TBD";

/** Which page of a board a /g/... path is: the board itself, its TV view or its printable board. */
export type BoardPage = "board" | "tv" | "print";

/** "/g/abc123" -> "board", "/g/abc123/tv" -> "tv", "/g/abc123/print" -> "print" (anything else under it: "board"). */
export function boardPageOf(pathname: string): BoardPage {
  const m = /^\/g\/[^/]+\/(tv|print)\/?$/i.exec(pathname);
  return m ? (m[1].toLowerCase() as BoardPage) : "board";
}

export function inviteMeta(state: GameState, origin: string, page: BoardPage = "board"): InviteMeta {
  const { game } = state;
  const matchup = `${teamLabel(game.teamX)} vs ${teamLabel(game.teamY)}`;
  let status: string;
  switch (game.status) {
    case "draft":
      status = "Board opening soon";
      break;
    case "open": {
      const left = squaresLeft(state);
      status =
        left === 0
          ? "Every square is taken — numbers drop soon"
          : `${left} of ${totalSquares(game.format.boardSize)} squares left. Grab yours`;
      break;
    }
    case "locked":
      status = "Numbers are drawn. Follow along live";
      break;
    case "final": {
      const final = finalScoreOf(state);
      status = final
        ? `Final: ${teamLabel(game.teamX)} ${final.scoreX}, ${teamLabel(game.teamY)} ${final.scoreY}`
        : "Final results are in";
      break;
    }
  }
  const url = `${origin}/g/${game.id}`;
  const image = `${origin}/og-image.png`;
  if (page === "tv") {
    return { title: `${game.name} on TV · JaxSquares`, description: `${matchup} · Live on the big screen · ${status}`, url: `${url}/tv`, image };
  }
  if (page === "print") {
    return { title: `Print ${game.name} · JaxSquares`, description: `${matchup} · A printable board with a QR code to follow it live`, url: `${url}/print`, image };
  }
  if (game.status === "final") {
    // The recap: "Final: Chiefs 27, Bills 24 · 4 winners" (how many players won, never what).
    const winners = Object.keys(winCounts(resolveResults(state))).length;
    const description = winners > 0 ? `${status} · ${winners} ${winners === 1 ? "winner" : "winners"}` : status;
    return { title: `See who won ${game.name} on JaxSquares`, description, url, image };
  }
  return { title: `Join ${game.name} on JaxSquares`, description: `${matchup} · ${status}`, url, image };
}

/** A finished board's final score: the Final's, else the feed's, else the last one recorded in game order. */
function finalScoreOf(state: GameState): { scoreX: number; scoreY: number } | null {
  const final = state.scores.find((s) => s.periodKey === "final");
  if (final) return final;
  if (state.live && state.live.state !== "pre") return state.live;
  const byKey = new Map(state.scores.map((s) => [s.periodKey, s]));
  const last = boardPeriods(state.game, state.scores)
    .filter((p) => byKey.has(p.key))
    .at(-1);
  return last ? (byKey.get(last.key) ?? null) : null;
}

function metaTags(m: InviteMeta): string {
  const tags: [string, string, string][] = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", "JaxSquares"],
    ["property", "og:title", m.title],
    ["property", "og:description", m.description],
    ["property", "og:url", m.url],
    ["property", "og:image", m.image],
    ["property", "og:image:alt", "JaxSquares football squares board"],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", m.title],
    ["name", "twitter:description", m.description],
    ["name", "twitter:image", m.image],
  ];
  return tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`).join("\n    ");
}

/**
 * JSON safe to inline in a `<script type="application/json">`: `<`, `>` and `&`
 * (so nothing can close the script or open markup, e.g. a board named
 * "</script><script>…") and U+2028/U+2029 become \u escapes. They can only
 * occur inside JSON strings, where the escape means the same character.
 */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * The board's state for the client to start from. Only ever the public
 * GameState (public player ids, no clientId or admin token): the same JSON
 * anyone gets from GET /api/games/:id.
 */
export function bootScript(state: GameState): string {
  return `<script type="application/json" id="${BOOT_STATE_ID}">${inlineJson(state)}</script>`;
}

/** Rewrites an index.html response with the invite's title and preview tags, plus the board's state when given. */
export function withInviteMeta(html: Response, meta: InviteMeta, boot?: GameState): Response {
  const rewritten = new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(meta.title);
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", meta.description);
      },
    })
    // Drop any generic preview tags so ours are the only ones crawlers see.
    .on('meta[property^="og:"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[name^="twitter:"]', {
      element(el) {
        el.remove();
      },
    })
    .on("head", {
      element(el) {
        el.append(`\n    ${metaTags(meta)}\n  `, { html: true });
      },
    })
    // At the end of the body, so the head (and its script preloads) arrives first.
    .on("body", {
      element(el) {
        if (boot) el.append(`${bootScript(boot)}\n  `, { html: true });
      },
    })
    .transform(html);
  const res = new Response(rewritten.body, rewritten);
  res.headers.set("content-type", "text/html; charset=utf-8");
  // Squares left changes constantly; let crawlers revalidate.
  res.headers.set("cache-control", "no-cache");
  res.headers.delete("etag");
  res.headers.delete("content-length");
  return res;
}
