// SqliteRunner — the minimum sqlite surface queue.ts needs. Lets us
// run the same SQL against expo-sqlite (RN) and better-sqlite3 (Node
// tests) without queue.ts knowing which driver it's on.
//
// The shape mirrors expo-sqlite v15+'s sync API (execSync / runSync /
// getAllSync / getFirstSync). Adapters in db.ts (RN) and
// __tests__/runner-node.ts (tests) glue better-sqlite3 to the same
// shape.

export interface SqliteRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface SqliteRunner {
  /** Execute one or more statements with no parameters / no rows back. */
  exec(sql: string): void
  /** Execute a single parameterized statement; returns row-count info. */
  run(sql: string, params?: ReadonlyArray<unknown>): SqliteRunResult
  /** Query rows. */
  all<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): T[]
  /** Query the first row (or undefined). */
  get<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): T | undefined
}
