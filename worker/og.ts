// Per-game link previews: GET /g/:id serves the SPA's index.html with Open
// Graph / Twitter tags rewritten so an invite pasted into iMessage, WhatsApp or
// Slack shows "Join <board name> on JaxSquares" instead of a generic card.

import { squaresLeft, totalSquares } from "../shared/squares";
import type { GameState } from "../shared/types";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export interface InviteMeta {
  title: string;
  description: string;
  url: string;
  image: string;
}

const teamLabel = (t: { name: string; abbr?: string }) => t.name || t.abbr || "TBD";

export function inviteMeta(state: GameState, origin: string): InviteMeta {
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
      const final = state.scores.find((s) => s.periodKey === "final") ?? state.live;
      status = final
        ? `Final: ${teamLabel(game.teamX)} ${final.scoreX}, ${teamLabel(game.teamY)} ${final.scoreY}`
        : "Final results are in";
      break;
    }
  }
  return {
    title: `Join ${game.name} on JaxSquares`,
    description: `${matchup} · ${status}`,
    url: `${origin}/g/${game.id}`,
    image: `${origin}/og-image.png`,
  };
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

/** Rewrites an index.html response with the invite's title and preview tags. */
export function withInviteMeta(html: Response, meta: InviteMeta): Response {
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
    .transform(html);
  const res = new Response(rewritten.body, rewritten);
  res.headers.set("content-type", "text/html; charset=utf-8");
  // Squares left changes constantly; let crawlers revalidate.
  res.headers.set("cache-control", "no-cache");
  res.headers.delete("etag");
  res.headers.delete("content-length");
  return res;
}
