// One-off ops script (.github/workflows/link-devices.yml): attach the devices
// that played as a given name to a signed-in account, exactly as if each of
// those browsers had signed in. Their rows (hosted boards, squares, players,
// co-host rights, push, passes, email notices, a club) move to the account's
// canonical clientId with the same merge statements a sign-in runs (built by
// the tables' owners), and each device gets a link, so a browser still holding
// one is signed in to the account on its next request.
//
//   MODE=dry   (default) lists what matches: never a clientId, only counts and board codes
//   MODE=apply runs it, in one D1 file import
//
// Only devices that aren't signed in anywhere are touched, and it refuses if
// more than MAX_DEVICES match (a name that isn't just one person's).

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import * as clubStore from "../../worker/clubs/store";
import * as db from "../../worker/db";
import * as emailStore from "../../worker/email/store";
import * as paymentsStore from "../../worker/payments/store";
import { playerIdOf } from "../../worker/playerIds";
import * as pushStore from "../../worker/push/store";

const MAX_DEVICES = 4;

const quote = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** SQL with its ?/?N parameters written in as literals (string literals in the SQL are left alone). */
export function inline(sql: string, params: unknown[]): string {
  let out = "";
  let next = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      // A string literal, '' escapes included: copied as is.
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += sql.slice(i, j + 1);
      i = j;
    } else if (ch === "?") {
      let digits = "";
      while (/\d/.test(sql[i + 1] ?? "")) digits += sql[++i];
      out += quote(params[digits ? Number(digits) - 1 : next++]);
    } else out += ch;
  }
  return out;
}

class Statement {
  constructor(
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}
  bind(...params: unknown[]): Statement {
    return new Statement(this.sql, params);
  }
}
const shim = { prepare: (sql: string) => new Statement(sql) } as unknown as D1Database;

/** The SQL that attaches `devices` to the account (`canonical`: its canonical clientId), as a sign-in on each would. */
export async function linkSql(devices: string[], account: { id: string; canonical: string }, now: number): Promise<string> {
  const to = { clientId: account.canonical, playerId: await playerIdOf(account.canonical) };
  const statements: Statement[] = [];
  for (const from of devices) {
    statements.push(
      ...(db.mergeClientStatements(shim, { clientId: from, playerId: await playerIdOf(from) }, to, now) as unknown as Statement[]),
      ...(pushStore.mergeClientStatements(shim, from, to.clientId) as unknown as Statement[]),
      ...(paymentsStore.mergeClientStatements(shim, from, to.clientId, now) as unknown as Statement[]),
      ...(emailStore.mergeClientStatements(shim, from, to.clientId) as unknown as Statement[]),
      ...(clubStore.mergeClientStatements(shim, from, to.clientId, now) as unknown as Statement[]),
      new Statement(`INSERT OR IGNORE INTO client_links (client_id, account_id, created_at) VALUES (?, ?, ?)`, [from, account.id, now]),
    );
  }
  // The merge's first statement only lists the boards it touches (a sign-in broadcasts them): not needed here.
  return statements
    .filter((s) => !/^\s*SELECT/i.test(s.sql))
    .map((s) => `${inline(s.sql, s.params).trim()};`)
    .join("\n");
}

function query<T>(sql: string): T[] {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "jaxsquares", "--remote", "--json", "--command", sql], { encoding: "utf8" });
  return (JSON.parse(out) as { results: T[] }[])[0].results;
}

async function main(): Promise<void> {
  const name = (process.env.PLAYER_NAME ?? "").trim().toLowerCase();
  const prefix = (process.env.ACCOUNT_PREFIX ?? "").trim();
  const apply = process.env.MODE === "apply";
  if (!name || !/^[0-9a-f]{6,}$/.test(prefix)) throw new Error("Set PLAYER_NAME and ACCOUNT_PREFIX");

  const accounts = query<{ id: string; canonical: string }>(`SELECT id, canonical_client_id AS canonical FROM accounts WHERE id LIKE ${quote(`${prefix}%`)}`);
  if (accounts.length !== 1) throw new Error(`Expected one account starting ${prefix}, found ${accounts.length}`);
  const [account] = accounts;

  const devices = query<{ client_id: string }>(
    `SELECT DISTINCT p.client_id AS client_id FROM players p
     WHERE lower(trim(p.name)) = ${quote(name)}
       AND p.client_id <> ${quote(account.canonical)}
       AND NOT EXISTS (SELECT 1 FROM client_links l WHERE l.client_id = p.client_id)`,
  ).map((r) => r.client_id);

  console.log(`Account ${prefix}: ${devices.length} device(s) played as "${name}" and aren't signed in.`);
  devices.forEach((id, i) => {
    const hosted = query<{ id: string; status: string }>(`SELECT id, status FROM games WHERE host_client_id = ${quote(id)} ORDER BY created_at`);
    const joined = query<{ id: string; n: number }>(
      `SELECT p.game_id AS id, (SELECT count(*) FROM squares s WHERE s.game_id = p.game_id AND s.client_id = p.client_id) AS n
       FROM players p WHERE p.client_id = ${quote(id)} ORDER BY p.joined_at`,
    );
    console.log(
      `  device ${i + 1}: hosts ${hosted.map((g) => `${g.id} (${g.status})`).join(", ") || "none"}; plays on ${joined.map((g) => `${g.id} (${g.n} squares)`).join(", ") || "none"}`,
    );
  });
  if (devices.length === 0) return;
  if (devices.length > MAX_DEVICES) throw new Error(`More than ${MAX_DEVICES} devices match: not one person's. Nothing changed.`);
  if (!apply) {
    console.log("Dry run: nothing changed. MODE=apply attaches them.");
    return;
  }

  writeFileSync("link-devices.sql", await linkSql(devices, account, Date.now()));
  execFileSync("npx", ["wrangler", "d1", "execute", "jaxsquares", "--remote", "--yes", "--file", "link-devices.sql"], { stdio: ["ignore", "ignore", "inherit"] });
  const [after] = query<{ n: number }>(`SELECT count(*) AS n FROM games WHERE host_client_id = ${quote(account.canonical)}`);
  console.log(`Done: ${devices.length} device(s) attached; the account hosts ${after.n} board(s) now.`);
}

// Run by the workflow; the test imports linkSql and inline.
if (process.env.LINK_DEVICES_RUN === "1") await main();
