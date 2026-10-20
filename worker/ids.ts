// Board codes: the id in every board link (/g/<id>), random and short.

const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no easily-confused characters

/** A new board id (6 characters; a collision is caught by the insert and rolled again). */
export function makeId(len = 6): string {
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(len))) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}
