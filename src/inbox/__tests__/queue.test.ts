import { describe, it, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'

import type Database from 'better-sqlite3'

import * as queue from '../queue'
import type { Intent, PolicyResult } from '../../policy/schema'
import { freshInMemory } from './runner-node.ts'
import type { SqliteRunner } from '../runner'

// Realistic Intent + PolicyResult fixtures sourced from the same
// schemas the guard uses. If those schemas change shape, these
// fixtures break loudly and we'll know to update the migration.

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const RECIPIENT = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs'

function tokenTransferIntent(amountUsd: number, requestedAtMs: number): Intent {
  return {
    kind: 'token_transfer',
    source: 'agent',
    requested_at_ms: requestedAtMs,
    mint: USDC,
    amount_base_units: Math.round(amountUsd * 1_000_000),
    recipient: RECIPIENT,
    program_id: TOKEN_PROGRAM,
  }
}

function allowResult(amount: number): PolicyResult {
  return {
    action: 'allow',
    policy_id: 'pol_test',
    reason: `${amount} under cap`,
  }
}

function denyResult(reason: string): PolicyResult {
  return {
    action: 'deny',
    policy_id: 'pol_test',
    reason,
    denied_by: 'amount',
  }
}

describe('inbox queue', () => {
  let db: Database.Database
  let runner: SqliteRunner

  beforeEach(() => {
    ;({ db, runner } = freshInMemory())
    queue.initSchema(runner)
  })

  it('enqueue inserts a pending row and returns a unique id', () => {
    const id = queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1_710_000_000_000),
    })
    assert.match(id, /[A-Za-z0-9-]{6,}/)
    const row = queue.getById(runner, id)
    assert.ok(row)
    assert.equal(row.status, 'pending')
    assert.equal(row.source, 'agent')
    assert.equal(row.signed_tx, null)
    assert.equal(row.error, null)
    assert.equal(row.denied_reason, null)
  })

  it('enqueue persists intent_json + policy_result and round-trips through decoders', () => {
    const intent = tokenTransferIntent(2.5, 1_710_000_000_000)
    const policy = allowResult(2.5)
    const id = queue.enqueue(runner, {
      intent,
      policy_result: policy,
      decoded_summary: 'Token transfer 2.5 USDC',
    })
    const row = queue.getById(runner, id)!
    assert.deepEqual(queue.decodeIntent(row), intent)
    assert.deepEqual(queue.decodePolicyResult(row), policy)
    assert.equal(row.decoded_summary, 'Token transfer 2.5 USDC')
  })

  it('list returns inserted rows newest-first', () => {
    queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
      now: 100,
    })
    queue.enqueue(runner, {
      intent: tokenTransferIntent(2, 2),
      now: 200,
    })
    queue.enqueue(runner, {
      intent: tokenTransferIntent(3, 3),
      now: 300,
    })
    const rows = queue.list(runner)
    assert.equal(rows.length, 3)
    assert.deepEqual(
      rows.map((r) => r.created_at_ms),
      [300, 200, 100],
    )
  })

  it('list respects status filter', () => {
    const a = queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
      now: 100,
    })
    queue.enqueue(runner, {
      intent: tokenTransferIntent(2, 2),
      now: 200,
    })
    queue.markSigned(runner, a, 'sig_a', 150)
    const pending = queue.list(runner, { status: 'pending' })
    const signed = queue.list(runner, { status: 'signed' })
    assert.equal(pending.length, 1)
    assert.equal(signed.length, 1)
    assert.equal(signed[0]!.signed_tx, 'sig_a')
  })

  it('list respects limit', () => {
    for (let i = 0; i < 5; i++) {
      queue.enqueue(runner, {
        intent: tokenTransferIntent(1, i),
        now: 100 + i,
      })
    }
    const rows = queue.list(runner, { limit: 3 })
    assert.equal(rows.length, 3)
  })

  it('markSigned transitions pending → signed and stores the sig', () => {
    const id = queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
      now: 100,
    })
    const ok = queue.markSigned(runner, id, 'abc123', 200)
    assert.equal(ok, true)
    const row = queue.getById(runner, id)!
    assert.equal(row.status, 'signed')
    assert.equal(row.signed_tx, 'abc123')
    assert.equal(row.updated_at_ms, 200)
  })

  it('markSigned is a no-op (returns false) when row was already signed', () => {
    const id = queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
    })
    queue.markSigned(runner, id, 'first', 200)
    const second = queue.markSigned(runner, id, 'second', 300)
    assert.equal(second, false)
    const row = queue.getById(runner, id)!
    assert.equal(row.signed_tx, 'first')
  })

  it('markSigned returns false for an unknown id', () => {
    const ok = queue.markSigned(runner, 'no-such-id', 'sig', 200)
    assert.equal(ok, false)
  })

  it('markDenied transitions pending → denied and stores the reason', () => {
    const id = queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
    })
    const ok = queue.markDenied(runner, id, 'over per-tx cap')
    assert.equal(ok, true)
    const row = queue.getById(runner, id)!
    assert.equal(row.status, 'denied')
    assert.equal(row.denied_reason, 'over per-tx cap')
  })

  it('markDenied is a no-op once the row left pending', () => {
    const id = queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
    })
    queue.markSigned(runner, id, 'sig', 100)
    const ok = queue.markDenied(runner, id, 'too late')
    assert.equal(ok, false)
  })

  it('markFailed transitions from any state', () => {
    const a = queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
    })
    const b = queue.enqueue(runner, {
      intent: tokenTransferIntent(2, 2),
    })
    queue.markSigned(runner, b, 'sig_b')
    queue.markFailed(runner, a, 'rpc down')
    queue.markFailed(runner, b, 'late settlement failure')
    assert.equal(queue.getById(runner, a)!.status, 'failed')
    assert.equal(queue.getById(runner, b)!.status, 'failed')
  })

  it('pendingCount tracks only pending rows', () => {
    const a = queue.enqueue(runner, { intent: tokenTransferIntent(1, 1) })
    queue.enqueue(runner, { intent: tokenTransferIntent(2, 2) })
    queue.enqueue(runner, { intent: tokenTransferIntent(3, 3) })
    queue.markSigned(runner, a, 'sig')
    assert.equal(queue.pendingCount(runner), 2)
  })

  it('duplicate id throws (PRIMARY KEY violation)', () => {
    queue.enqueue(runner, {
      intent: tokenTransferIntent(1, 1),
      id: 'fixed-id',
    })
    assert.throws(() =>
      queue.enqueue(runner, {
        intent: tokenTransferIntent(2, 2),
        id: 'fixed-id',
      }),
    )
  })

  it('plan acceptance — 3 requests inserted, listed, marked signed', () => {
    const ids = [1, 2, 3].map((i) =>
      queue.enqueue(runner, {
        intent: tokenTransferIntent(i, i * 100),
        now: i * 100,
        policy_result: allowResult(i),
      }),
    )
    assert.equal(queue.list(runner).length, 3)
    for (const id of ids) {
      assert.equal(queue.markSigned(runner, id, `sig_${id}`), true)
    }
    const signed = queue.list(runner, { status: 'signed' })
    assert.equal(signed.length, 3)
    assert.equal(queue.pendingCount(runner), 0)
    assert.deepEqual(
      new Set(signed.map((r) => r.signed_tx)),
      new Set(ids.map((id) => `sig_${id}`)),
    )
  })

  it('stores a denied policy result alongside the intent', () => {
    const intent = tokenTransferIntent(100, 1)
    const policy = denyResult('amount over max_per_tx')
    const id = queue.enqueue(runner, {
      intent,
      policy_result: policy,
    })
    queue.markDenied(runner, id, policy.reason)
    const row = queue.getById(runner, id)!
    assert.equal(row.status, 'denied')
    assert.deepEqual(queue.decodePolicyResult(row), policy)
    assert.equal(row.denied_reason, policy.reason)
  })

  after(() => {
    db?.close()
  })
})
