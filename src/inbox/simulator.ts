// Day 12 simulator. Produces canned Intents and routes them through
// PolicyGuard against a hardcoded default policy, dropping each into
// the inbox with the correct terminal state.
//
// 'allow' results are marked signed with a SIMULATED_<random> sig —
// no real Keystore signing here. The real on-chain path was shown
// on Days 8 (send-test) and 10 (x402-test); Day 12 is about the
// inbox's *routing* behavior, not the signer. Day 13 wires real
// signing through the inbox.

import { evaluate } from '../policy/guard'
import type { Intent, LedgerSnapshot, Policy } from '../policy/schema'
import * as queue from './queue'
import type { SqliteRunner } from './runner'
import { summarizeIntent } from './format'

// Same fixtures used in the guard tests.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const PAY_SH_PROGRAM = 'PaySh1111111111111111111111111111111111111'
const POCKET_VAULT_PROGRAM = 'PCketVau1t1111111111111111111111111111111111'
const RECIPIENT = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs'
const RECIPIENT_2 = '9LXVm6KrLNh1qDX2VRTpVwQDqMTKKbsWMcDmTV8YfHmL'

const USDC = (dollars: number) => Math.round(dollars * 1_000_000)

/**
 * Default Day 12 policy. Day 13 promotes this to user-editable and
 * pushes it onchain via pocket_vault.set_policy.
 */
export function defaultPolicy(): Policy {
  return {
    id: 'pol_default_v1',
    name: 'Pocket default agent policy',
    version: 1,
    max_per_tx_base_units: USDC(5),
    max_per_day_base_units: USDC(50),
    // Anything strictly over 2 USDC requires manual approval.
    require_review_above_base_units: USDC(2),
    allowed_program_ids: [TOKEN_PROGRAM, PAY_SH_PROGRAM, POCKET_VAULT_PROGRAM],
    allowed_token_mints: [USDC_MINT],
    allowed_x402_hosts: ['api.helius.dev', 'api.openai.com'],
    denied_program_ids: [],
    expiry_slot: null,
    created_at_ms: Date.now(),
  }
}

/**
 * Build a LedgerSnapshot from the inbox itself: sum amounts on rows
 * marked signed within the current 24h window. Best-effort — bad
 * JSON or unknown shapes are skipped.
 */
export function computeLedger(runner: SqliteRunner): LedgerSnapshot {
  const now = Date.now()
  const dayStart = now - 86_400_000
  const signed = queue
    .list(runner, { status: 'signed', limit: 1000 })
    .filter((r) => r.updated_at_ms >= dayStart)
  let spent = 0
  for (const r of signed) {
    const i = queue.decodeIntent(r)
    if (i?.amount_base_units) spent += i.amount_base_units
  }
  return {
    // We don't enforce slot-based expiry in canned scenarios; a far-
    // future slot keeps the expiry check out of the way.
    current_slot: 999_999_999,
    current_time_ms: now,
    spent_today_base_units: spent,
    day_start_ms: dayStart,
  }
}

/**
 * Run PolicyGuard against the intent + current ledger, enqueue the
 * row, and route to the terminal state implied by the guard:
 *   allow → 'signed' (with a SIMULATED_<random> sig)
 *   deny  → 'denied' with the reason
 *   queue → leave 'pending' for the user to approve / deny manually
 *
 * Returns the inserted id and the policy result so the caller can
 * surface them inline (no need to re-read the row).
 */
export function evaluateAndEnqueue(
  runner: SqliteRunner,
  intent: Intent,
  policy: Policy,
  ledger: LedgerSnapshot = computeLedger(runner),
): { id: string; action: 'allow' | 'queue' | 'deny'; reason?: string } {
  const result = evaluate(intent, policy, ledger)
  const id = queue.enqueue(runner, {
    intent,
    policy_result: result,
    decoded_summary: summarizeIntent(intent),
  })
  if (result.action === 'allow') {
    queue.markSigned(runner, id, `SIMULATED_${shortRandom()}`)
  } else if (result.action === 'deny') {
    queue.markDenied(runner, id, result.reason)
  }
  return {
    id,
    action: result.action,
    reason: result.action !== 'allow' ? result.reason : undefined,
  }
}

// === Canned scenarios — the "Simulate agent request" menu ===

export type Scenario = {
  key: string
  label: string
  build: () => Intent
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'small-allow',
    label: 'Agent: send 1 USDC (auto-approve)',
    build: () => ({
      kind: 'token_transfer',
      source: 'agent',
      requested_at_ms: Date.now(),
      mint: USDC_MINT,
      amount_base_units: USDC(1),
      recipient: RECIPIENT,
      program_id: TOKEN_PROGRAM,
    }),
  },
  {
    key: 'mid-queue',
    label: 'Agent: send 3 USDC (queue for review)',
    build: () => ({
      kind: 'token_transfer',
      source: 'agent',
      requested_at_ms: Date.now(),
      mint: USDC_MINT,
      amount_base_units: USDC(3),
      recipient: RECIPIENT_2,
      program_id: TOKEN_PROGRAM,
    }),
  },
  {
    key: 'large-deny',
    label: 'Agent: send 100 USDC (deny — over per-tx cap)',
    build: () => ({
      kind: 'token_transfer',
      source: 'agent',
      requested_at_ms: Date.now(),
      mint: USDC_MINT,
      amount_base_units: USDC(100),
      recipient: RECIPIENT,
      program_id: TOKEN_PROGRAM,
    }),
  },
  {
    key: 'x402-allow',
    label: 'Agent: pay 0.5 USDC to api.helius.dev (auto-approve)',
    build: () => ({
      kind: 'x402_payment',
      source: 'agent',
      requested_at_ms: Date.now(),
      host: 'api.helius.dev',
      url: 'https://api.helius.dev/v0/das',
      mint: USDC_MINT,
      amount_base_units: USDC(0.5),
      program_id: PAY_SH_PROGRAM,
    }),
  },
  {
    key: 'x402-deny',
    label: 'Agent: pay 0.5 USDC to evil.example.com (deny — host)',
    build: () => ({
      kind: 'x402_payment',
      source: 'agent',
      requested_at_ms: Date.now(),
      host: 'evil.example.com',
      url: 'https://evil.example.com/scrape',
      mint: USDC_MINT,
      amount_base_units: USDC(0.5),
      program_id: PAY_SH_PROGRAM,
    }),
  },
]

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 10)
}
