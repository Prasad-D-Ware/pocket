// Inbox status state machine. Day 11 surface keeps it lean:
//
//   pending  ─── markSigned ──▶ signed
//      │
//      ├──── markDenied ────▶ denied
//      │
//      └──── markFailed ────▶ failed
//
// Day 12 (UI) may slice 'pending' into 'auto_approved' vs
// 'awaiting_review' once PolicyGuard hits the wire. For now any
// pending row is awaiting a terminal decision.

export const INBOX_STATUSES = [
  'pending',
  'signed',
  'denied',
  'failed',
] as const
export type InboxStatus = (typeof INBOX_STATUSES)[number]

export const INTENT_SOURCES = ['user', 'agent', 'inbox_replay'] as const
export type IntentSource = (typeof INTENT_SOURCES)[number]

/**
 * Raw row shape — matches the sqlite columns exactly. Fields kept as
 * primitives (strings / numbers / null) so the same shape round-trips
 * through expo-sqlite, better-sqlite3, and JSON serialization in
 * IPC messages without bespoke (de)serializers.
 */
export interface InboxRow {
  id: string
  source: IntentSource
  intent_json: string
  decoded_summary: string | null
  policy_result: string | null
  status: InboxStatus
  denied_reason: string | null
  signed_tx: string | null
  error: string | null
  created_at_ms: number
  updated_at_ms: number
}
