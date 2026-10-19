// Optional email notices (docs/email.md): the address rules the Worker and the
// app share. Pure, no IO. An address is private: it's kept server-side for the
// board it was given for, shown back only to its owner, masked (`maskEmail`),
// and never goes in a public object (GameState, activity, push, previews).

/** The opt-in's one line, wherever it's offered. */
export const EMAIL_OPT_IN = "Email me when the numbers are drawn and if I win";

/** RFC 5321's practical cap on a whole address, and on its local part. */
export const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;

/** Friendly errors the API answers with and the app shows as-is. */
export const EMAIL_ERRORS = {
  invalid: "That doesn't look like an email address. Check it and try again.",
  tooLong: "That email address is too long.",
  reserved: "Use an email address you can open, so you can confirm it.",
} as const;

// Dot-atom local part with the characters real addresses use (letters,
// digits, . _ % + ' -), no leading, trailing or doubled dot; a domain of two
// or more labels ending in letters (or an IDN's xn-- form).
const LOCAL_RE = /^[a-z0-9_%+'-]+(?:\.[a-z0-9_%+'-]+)*$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Names that can never receive mail (RFC 2606 / 6761). Anything fancier isn't worth building. */
const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local"]);
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

/** Trimmed, lowercased, NFC: how an address is compared and stored. */
export function normalizeEmail(raw: string): string {
  return raw.normalize("NFC").trim().toLowerCase();
}

/** Why `raw` can't be used (one of EMAIL_ERRORS), or null when it's fine. Checks the normalized form. */
export function emailProblem(raw: unknown): string | null {
  if (typeof raw !== "string") return EMAIL_ERRORS.invalid;
  const email = normalizeEmail(raw);
  if (email.length > EMAIL_MAX_LENGTH) return EMAIL_ERRORS.tooLong;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at !== email.indexOf("@")) return EMAIL_ERRORS.invalid;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > LOCAL_MAX_LENGTH || !LOCAL_RE.test(local)) return EMAIL_ERRORS.invalid;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l)) || !TLD_RE.test(labels[labels.length - 1])) return EMAIL_ERRORS.invalid;
  if (RESERVED_TLDS.has(labels[labels.length - 1]) || RESERVED_DOMAINS.has(labels.slice(-2).join("."))) return EMAIL_ERRORS.reserved;
  return null;
}

export function isEmailAddress(raw: unknown): raw is string {
  return emailProblem(raw) === null;
}

/** "jordan@gmail.com" -> "j•••@gmail.com": what the owner sees back. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${Array.from(email.slice(0, at))[0]}•••@${email.slice(at + 1)}`;
}
