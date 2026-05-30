// All inbox SQL lives here as exported constants so queue.ts is
// portable across sqlite drivers (expo-sqlite on RN, better-sqlite3
// in Node tests) and so the schema is greppable from one place.
//
// CHECK constraints are intentionally absent — validation lives in
// the TS layer where we can return typed errors. Sqlite-level rejects
// would just throw a string that we'd have to re-parse.

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS requests (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,
  intent_json     TEXT NOT NULL,
  decoded_summary TEXT,
  policy_result   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  denied_reason   TEXT,
  signed_tx       TEXT,
  error           TEXT,
  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_status  ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at_ms DESC);
`

export const INSERT_REQUEST = `
INSERT INTO requests
  (id, source, intent_json, decoded_summary, policy_result,
   status, denied_reason, signed_tx, error,
   created_at_ms, updated_at_ms)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

// markSigned / markDenied only fire on rows that are still 'pending'.
// Idempotency: re-marking a signed row is a no-op (0 changes), and
// the caller can detect that via the returned `changes` count.
export const MARK_SIGNED = `
UPDATE requests
   SET status = 'signed', signed_tx = ?, updated_at_ms = ?
 WHERE id = ? AND status = 'pending'
`

export const MARK_DENIED = `
UPDATE requests
   SET status = 'denied', denied_reason = ?, updated_at_ms = ?
 WHERE id = ? AND status = 'pending'
`

// markFailed is allowed from any state — failures can show up at any
// point in the pipeline (e.g. Keystore unavailable mid-sign).
export const MARK_FAILED = `
UPDATE requests
   SET status = 'failed', error = ?, updated_at_ms = ?
 WHERE id = ?
`

export const GET_BY_ID = `SELECT * FROM requests WHERE id = ?`

export const LIST_ALL = `
SELECT * FROM requests
ORDER BY created_at_ms DESC
LIMIT ?
`

export const LIST_BY_STATUS = `
SELECT * FROM requests
WHERE status = ?
ORDER BY created_at_ms DESC
LIMIT ?
`

export const COUNT_PENDING = `SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'`
