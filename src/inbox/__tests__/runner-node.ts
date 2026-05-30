// Node-only SqliteRunner over better-sqlite3, for the test suite.
// Mirrors the expoRunner in src/inbox/db.ts so queue.ts behaves the
// same in both environments.

import Database from 'better-sqlite3'

import type { SqliteRunResult, SqliteRunner } from '../runner'

export function nodeRunner(db: Database.Database): SqliteRunner {
  return {
    exec: (sql) => {
      db.exec(sql)
    },
    run: (sql, params = []): SqliteRunResult => {
      const info = db.prepare(sql).run(...(params as unknown[]))
      return {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
      }
    },
    all: <T,>(sql: string, params: ReadonlyArray<unknown> = []): T[] => {
      return db.prepare(sql).all(...(params as unknown[])) as T[]
    },
    get: <T,>(sql: string, params: ReadonlyArray<unknown> = []): T | undefined => {
      return db.prepare(sql).get(...(params as unknown[])) as T | undefined
    },
  }
}

export function freshInMemory(): { db: Database.Database; runner: SqliteRunner } {
  const db = new Database(':memory:')
  return { db, runner: nodeRunner(db) }
}
