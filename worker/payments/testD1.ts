// Test-only: an in-memory D1 stand-in backed by node:sqlite, so the purchases
// SQL and migration run for real in unit tests. Node modules are imported by a
// computed specifier because the worker tsconfig has no Node types.

interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): { changes: number | bigint };
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

const nodeModule = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);

const returnsRows = (sql: string) => /^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);

class TestStatement {
  constructor(
    private db: SqliteDatabase,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): TestStatement {
    return new TestStatement(this.db, this.sql, params);
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    return { results: this.exec() as T[], success: true, meta: {} };
  }

  async run(): Promise<{ results: unknown[]; success: true; meta: { changes: number } }> {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  }

  exec(): Record<string, unknown>[] {
    if (returnsRows(this.sql)) return this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r }));
    this.db.prepare(this.sql).run(...this.params);
    return [];
  }
}

export interface TestD1 {
  d1: D1Database;
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[];
}

/** A fresh database with the given migration files (paths relative to the repo root) applied. */
export async function createTestD1(migrations: string[]): Promise<TestD1> {
  const { DatabaseSync } = (await nodeModule("sqlite")) as { DatabaseSync: new (path: string) => SqliteDatabase };
  const { readFileSync } = (await nodeModule("fs")) as { readFileSync: (path: URL, enc: "utf8") => string };
  const db = new DatabaseSync(":memory:");
  for (const file of migrations) db.exec(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"));

  const d1 = {
    prepare: (sql: string) => new TestStatement(db, sql),
    // D1 runs a batch as one transaction.
    async batch(statements: TestStatement[]) {
      db.exec("BEGIN");
      try {
        const out = statements.map((s) => ({ results: s.exec(), success: true, meta: {} }));
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return {
    d1: d1 as unknown as D1Database,
    query: <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params).map((r) => ({ ...r })) as T[],
  };
}
