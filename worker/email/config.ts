// Whether email notices are set up, and with what (docs/email.md). Every
// setting is optional: without all three the opt-in is hidden in the app
// (AppConfig.emailEnabled) and the email routes answer 503.

import type { Env } from "../env";

export const DEFAULT_ORIGIN = "https://jaxsquares.com";
/** EMAIL_TOKEN_SECRET shorter than this is treated as unset (it signs every unsubscribe link). */
export const MIN_SECRET_LENGTH = 16;

export interface EmailSetup {
  /** Resend API key. */
  apiKey: string;
  /** The From header: "JaxSquares <notices@jaxsquares.com>". */
  from: string;
  /** EMAIL_TOKEN_SECRET: signs unsubscribe links and keys addresses. */
  secret: string;
  /** Where links in emails point: APP_ORIGIN. */
  origin: string;
}

type EmailEnv = Pick<Env, "RESEND_API_KEY" | "EMAIL_FROM" | "EMAIL_TOKEN_SECRET" | "APP_ORIGIN">;

const ADDRESS = /^[^\s<>@"]+@[^\s<>@"]+\.[^\s<>@"]+$/;

/**
 * EMAIL_FROM as a From header: "Name <address>" as given, or a bare address
 * under the name JaxSquares. null when empty or malformed.
 */
export function senderOf(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || /[\r\n]/.test(v)) return null;
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(v);
  if (named) {
    const name = named[1].trim().replace(/^"(.*)"$/, "$1").trim() || "JaxSquares";
    return ADDRESS.test(named[2]) && !/[<>"]/.test(name) ? `${name} <${named[2]}>` : null;
  }
  return ADDRESS.test(v) ? `JaxSquares <${v}>` : null;
}

let warnedSecret = false;

/** EMAIL_TOKEN_SECRET when it's long enough to sign with, else null. Unsubscribe links work with this alone. */
export function tokenSecretOf(env: Pick<Env, "EMAIL_TOKEN_SECRET">): string | null {
  const secret = env.EMAIL_TOKEN_SECRET ?? "";
  if (secret.length >= MIN_SECRET_LENGTH) return secret;
  if (secret && !warnedSecret) {
    warnedSecret = true;
    console.error(`EMAIL_TOKEN_SECRET is under ${MIN_SECRET_LENGTH} characters; email notices are off`);
  }
  return null;
}

export function originOf(env: Pick<Env, "APP_ORIGIN">): string {
  return (env.APP_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, "");
}

/** Everything sending needs, or null when email notices aren't set up. */
export function emailSetup(env: EmailEnv): EmailSetup | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = senderOf(env.EMAIL_FROM);
  const secret = tokenSecretOf(env);
  if (!apiKey || !from || !secret) return null;
  return { apiKey, from, secret, origin: originOf(env) };
}

/** For GET /api/config: the app shows the opt-in only when this is true. */
export function emailEnabled(env: EmailEnv): boolean {
  return emailSetup(env) !== null;
}
