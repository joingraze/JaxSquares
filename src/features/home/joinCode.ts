// Board codes: the 6-character id at the end of an invite link
// (jaxsquares.com/g/<code>). Pure helpers for the "Join with a code" field.

/** Same alphabet the Worker draws board ids from: no 0/O, 1/I/L. */
export const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CODE_LENGTH = 6;

const CONFUSABLE = /[01ilo]/i;

export interface ParsedCode {
  /** Up to CODE_LENGTH valid characters, uppercased for display. */
  display: string;
  /** Lowercase id to route to, when complete and valid. */
  id: string | null;
  /** Inline problem to show, if any. */
  error: string | null;
}

/**
 * Normalizes whatever was typed or pasted: a bare code ("ab3 kx9", "AB3-KX9")
 * or a whole invite link ("https://jaxsquares.com/g/ab3kx9?x=1").
 */
export function parseJoinCode(raw: string): ParsedCode {
  let text = raw.trim();
  const link = /\/g\/([A-Za-z0-9]+)/.exec(text);
  if (link) text = link[1];
  const compact = text.replace(/[\s\-_.]/g, "");
  if (CONFUSABLE.test(compact)) {
    const bad = compact.match(CONFUSABLE)![0].toUpperCase();
    return {
      display: compact.slice(0, CODE_LENGTH).toUpperCase(),
      id: null,
      error: `Codes never use 0, 1, I, L or O. Check the "${bad}".`,
    };
  }
  const invalid = /[^A-Za-z0-9]/.exec(compact);
  if (invalid) {
    return { display: compact.replace(/[^A-Za-z0-9]/g, "").slice(0, CODE_LENGTH).toUpperCase(), id: null, error: "Codes are letters and numbers only." };
  }
  if (compact.length > CODE_LENGTH) {
    return { display: compact.slice(0, CODE_LENGTH).toUpperCase(), id: null, error: `Codes are ${CODE_LENGTH} characters.` };
  }
  const display = compact.toUpperCase();
  return { display, id: display.length === CODE_LENGTH ? display.toLowerCase() : null, error: null };
}
