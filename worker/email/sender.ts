// Sending email, provider-agnostic: the rest of the module builds
// `OutgoingEmail`s and hands them to an `EmailSender`. The first (and only)
// one is Resend's HTTPS API (https://resend.com/docs/api-reference):
//   POST https://api.resend.com/emails        one message
//   POST https://api.resend.com/emails/batch  up to 100 in one request
// A notice to a whole board goes as batches, so a big board is one or two
// requests (Resend's default limit is a couple of requests a second, and a
// Worker has a budget of subrequests). Each request carries an
// Idempotency-Key, so the one retry (on a 429, a 5xx or a network error)
// can't send twice.
//
// Cloudflare's own `send_email` binding isn't used: it only delivers to
// addresses verified in Email Routing, never to players. A future sender only
// has to implement `EmailSender`.

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers: List-Unsubscribe and List-Unsubscribe-Post on every email. */
  headers: Record<string, string>;
}

export interface SendResult {
  sent: number;
  failed: number;
}

export interface EmailSender {
  /** Sends every message. Never throws: failures are logged and counted. */
  send(messages: OutgoingEmail[]): Promise<SendResult>;
}

export const RESEND_API = "https://api.resend.com";
/** Resend's batch endpoint takes at most this many messages. */
export const RESEND_BATCH_MAX = 100;
const RETRY_DELAY_MS = 1000;
const RETRY_DELAY_MAX_MS = 3000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A header value or subject can't carry a line break (header injection), whatever made it. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function resendBody(from: string, m: OutgoingEmail) {
  const headers = Object.fromEntries(Object.entries(m.headers).map(([k, v]) => [k, oneLine(v)]));
  return { from, to: [m.to], subject: oneLine(m.subject), html: m.html, text: m.text, headers };
}

export function resendSender(apiKey: string, from: string, fetcher: typeof fetch = (input, init) => fetch(input, init)): EmailSender {
  /** One request (a single message or a batch), retried once when that's safe. True when Resend took it. */
  async function post(path: string, body: unknown, count: number): Promise<boolean> {
    const key = crypto.randomUUID();
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      let detail = "";
      let retryAfter = 0;
      try {
        const res = await fetcher(`${RESEND_API}${path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": key },
          body: JSON.stringify(body),
        });
        if (res.ok) return true;
        status = res.status;
        retryAfter = Number(res.headers.get("retry-after")) * 1000 || 0;
        detail = (await res.text().catch(() => "")).slice(0, 300);
      } catch (err) {
        detail = String(err);
      }
      const retryable = status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt > 0) {
        console.error(`email: Resend ${path} (${count}) failed: ${status || "network"} ${detail}`);
        return false;
      }
      await sleep(Math.min(RETRY_DELAY_MAX_MS, Math.max(RETRY_DELAY_MS, retryAfter)));
    }
  }

  return {
    async send(messages) {
      if (messages.length === 0) return { sent: 0, failed: 0 };
      if (messages.length === 1) {
        const ok = await post("/emails", resendBody(from, messages[0]), 1);
        return ok ? { sent: 1, failed: 0 } : { sent: 0, failed: 1 };
      }
      const tally: SendResult = { sent: 0, failed: 0 };
      for (let i = 0; i < messages.length; i += RESEND_BATCH_MAX) {
        const chunk = messages.slice(i, i + RESEND_BATCH_MAX);
        const ok = await post("/emails/batch", chunk.map((m) => resendBody(from, m)), chunk.length);
        if (ok) tally.sent += chunk.length;
        else tally.failed += chunk.length;
      }
      return tally;
    },
  };
}
