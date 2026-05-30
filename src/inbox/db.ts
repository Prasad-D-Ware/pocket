// RN-only: opens the expo-sqlite database and exposes a SqliteRunner
// adapter. Importing this file in a Node test will explode because
// expo-sqlite is a native module — that's intentional. Use the test
// runner adapter in src/inbox/__tests__/runner-node.ts instead.

import * as SQLite from 'expo-sqlite'

import { initSchema } from './queue'
import type { SqliteRunResult, SqliteRunner } from './runner'

const DB_NAME = 'pocket-inbox.db'

let cached: { db: SQLite.SQLiteDatabase; runner: SqliteRunner } | null = null

export function openInbox(): SqliteRunner {
  if (cached) return cached.runner
  const db = SQLite.openDatabaseSync(DB_NAME)
  const runner = expoRunner(db)
  initSchema(runner)
  cached = { db, runner }
  return runner
}

/**
 * Close the cached db and clear the singleton — only needed for tests
 * or wallet resets. Production code holds the singleton forever.
 */
export function closeInbox(): void {
  if (!cached) return
  cached.db.closeSync()
  cached = null
}

function expoRunner(db: SQLite.SQLiteDatabase): SqliteRunner {
  return {
    exec: (sql) => {
      db.execSync(sql)
    },
    run: (sql, params = []): SqliteRunResult => {
      const r = db.runSync(sql, ...(params as SQLite.SQLiteBindValue[]))
      return {
        changes: r.changes,
        lastInsertRowid: r.lastInsertRowId,
      }
    },
    all: <T,>(sql: string, params: ReadonlyArray<unknown> = []): T[] => {
      return db.getAllSync<T extends object ? T : never>(
        sql,
        ...(params as SQLite.SQLiteBindValue[]),
      ) as T[]
    },
    get: <T,>(sql: string, params: ReadonlyArray<unknown> = []): T | undefined => {
      const v = db.getFirstSync<T extends object ? T : never>(
        sql,
        ...(params as SQLite.SQLiteBindValue[]),
      )
      return (v ?? undefined) as T | undefined
    },
  }
}
