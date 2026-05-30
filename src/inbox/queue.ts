// Queue operations over the inbox table. All functions take a
// SqliteRunner so the same logic runs in RN (expo-sqlite) and Node
// tests (better-sqlite3). No imports from 'react-native' or
// 'expo-sqlite' here on purpose.

import type { Intent, PolicyResult } from '../policy/schema'
import {
  COUNT_PENDING,
  GET_BY_ID,
  INSERT_REQUEST,
  LIST_ALL,
  LIST_BY_STATUS,
  MARK_DENIED,
  MARK_FAILED,
  MARK_SIGNED,
  SCHEMA,
} from './sql'
import type { SqliteRunner } from './runner'
import type { InboxRow, InboxStatus, IntentSource } from './types'

export type EnqueueInput = {
  intent: Intent
  decoded_summary?: string | null
  policy_result?: PolicyResult | null
  source?: IntentSource
  /** Override `Date.now()` — for deterministic tests. */
  now?: number
  /** Override the generated id — for deterministic tests. */
  id?: string
}

export type ListOptions = {
  status?: InboxStatus
  limit?: number
}

const DEFAULT_LIMIT = 100

/**
 * Initialize the schema (idempotent). Call once at app start.
 */
export function initSchema(runner: SqliteRunner): void {
  runner.exec(SCHEMA)
}

/**
 * Insert a new request in 'pending' state. Returns the id (generated
 * if not provided). Throws if the id collides — caller's bug.
 */
export function enqueue(runner: SqliteRunner, input: EnqueueInput): string {
  const id = input.id ?? randomId()
  const now = input.now ?? Date.now()
  runner.run(INSERT_REQUEST, [
    id,
    input.source ?? input.intent.source,
    JSON.stringify(input.intent),
    input.decoded_summary ?? null,
    input.policy_result ? JSON.stringify(input.policy_result) : null,
    'pending',
    null, // denied_reason
    null, // signed_tx
    null, // error
    now,
    now,
  ])
  return id
}

/**
 * Transition pending → signed. Returns true if a row was updated,
 * false if the row was not pending (already signed/denied/failed) or
 * not found.
 */
export function markSigned(
  runner: SqliteRunner,
  id: string,
  signedTx: string,
  now: number = Date.now(),
): boolean {
  const r = runner.run(MARK_SIGNED, [signedTx, now, id])
  return r.changes > 0
}

/**
 * Transition pending → denied. Returns true if a row was updated.
 */
export function markDenied(
  runner: SqliteRunner,
  id: string,
  reason: string,
  now: number = Date.now(),
): boolean {
  const r = runner.run(MARK_DENIED, [reason, now, id])
  return r.changes > 0
}

/**
 * Mark a request failed. Allowed from any state (failures can happen
 * at any pipeline stage — e.g. Keystore unavailable mid-sign).
 */
export function markFailed(
  runner: SqliteRunner,
  id: string,
  error: string,
  now: number = Date.now(),
): boolean {
  const r = runner.run(MARK_FAILED, [error, now, id])
  return r.changes > 0
}

export function getById(
  runner: SqliteRunner,
  id: string,
): InboxRow | undefined {
  return runner.get<InboxRow>(GET_BY_ID, [id])
}

export function list(
  runner: SqliteRunner,
  options: ListOptions = {},
): InboxRow[] {
  const limit = options.limit ?? DEFAULT_LIMIT
  if (options.status) {
    return runner.all<InboxRow>(LIST_BY_STATUS, [options.status, limit])
  }
  return runner.all<InboxRow>(LIST_ALL, [limit])
}

export function pendingCount(runner: SqliteRunner): number {
  const r = runner.get<{ n: number }>(COUNT_PENDING)
  return r?.n ?? 0
}

// Decode helpers — sqlite stores JSON as TEXT; callers usually want
// the typed objects back. Defensive: bad JSON is treated as null
// rather than throwing, so a corrupted row doesn't take down the
// whole inbox view.
export function decodeIntent(row: InboxRow): Intent | null {
  try {
    return JSON.parse(row.intent_json) as Intent
  } catch {
    return null
  }
}

export function decodePolicyResult(row: InboxRow): PolicyResult | null {
  if (!row.policy_result) return null
  try {
    return JSON.parse(row.policy_result) as PolicyResult
  } catch {
    return null
  }
}

// crypto.randomUUID is available on Node 19+, RN with
// react-native-quick-crypto polyfill (loaded at app start in
// polyfill.js), and modern web. Fallback shouldn't trigger but is
// kept so the test runner doesn't explode if a runtime is missing it.
function randomId(): string {
  const cryptoGlobal = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoGlobal?.randomUUID) return cryptoGlobal.randomUUID()
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
