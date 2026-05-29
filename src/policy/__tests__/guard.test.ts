import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate } from '../guard'
import type { Intent, LedgerSnapshot, Policy } from '../schema'

// Fixture pubkeys — base58, 32-44 chars, alphabet excludes 0/O/I/l.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const WSOL_MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const PAY_SH_PROGRAM = 'PaySh1111111111111111111111111111111111111'
const POCKET_VAULT_PROGRAM = 'PCketVau1t1111111111111111111111111111111111'
const BAD_PROGRAM = 'Bad11111111111111111111111111111111111111111'
const RECIPIENT = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs'
const VAULT_PDA = '9LXVm6KrLNh1qDX2VRTpVwQDqMTKKbsWMcDmTV8YfHmL'

// USDC has 6 decimals.
const USDC = (dollars: number) => Math.round(dollars * 1_000_000)

function basePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'pol_default',
    name: 'default policy',
    version: 1,
    max_per_tx_base_units: USDC(5),
    max_per_day_base_units: USDC(50),
    require_review_above_base_units: null,
    allowed_program_ids: [TOKEN_PROGRAM, PAY_SH_PROGRAM, POCKET_VAULT_PROGRAM],
    allowed_token_mints: [USDC_MINT],
    allowed_x402_hosts: ['api.helius.dev', 'api.openai.com'],
    denied_program_ids: [BAD_PROGRAM],
    expiry_slot: null,
    created_at_ms: 1_710_000_000_000,
    ...overrides,
  }
}

type TokenTransferIntent = Extract<Intent, { kind: 'token_transfer' }>
type X402PaymentIntent = Extract<Intent, { kind: 'x402_payment' }>
type VaultWithdrawIntent = Extract<Intent, { kind: 'vault_withdraw' }>

function tokenTransfer(
  overrides: Partial<TokenTransferIntent> = {},
): Intent {
  return {
    kind: 'token_transfer',
    source: 'agent',
    requested_at_ms: 1_710_000_100_000,
    mint: USDC_MINT,
    amount_base_units: USDC(1),
    recipient: RECIPIENT,
    program_id: TOKEN_PROGRAM,
    ...overrides,
  }
}

function x402Payment(overrides: Partial<X402PaymentIntent> = {}): Intent {
  return {
    kind: 'x402_payment',
    source: 'agent',
    requested_at_ms: 1_710_000_100_000,
    host: 'api.helius.dev',
    url: 'https://api.helius.dev/v0/das',
    mint: USDC_MINT,
    amount_base_units: USDC(0.5),
    program_id: PAY_SH_PROGRAM,
    ...overrides,
  }
}

function vaultWithdraw(
  overrides: Partial<VaultWithdrawIntent> = {},
): Intent {
  return {
    kind: 'vault_withdraw',
    source: 'agent',
    requested_at_ms: 1_710_000_100_000,
    vault: VAULT_PDA,
    mint: USDC_MINT,
    amount_base_units: USDC(2),
    recipient: RECIPIENT,
    program_id: POCKET_VAULT_PROGRAM,
    ...overrides,
  }
}

function ledger(overrides: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return {
    current_slot: 250_000_000,
    current_time_ms: 1_710_000_100_000,
    spent_today_base_units: 0,
    day_start_ms: 1_710_000_000_000,
    ...overrides,
  }
}

describe('PolicyGuard — happy paths', () => {
  it('allows a token transfer well under all limits', () => {
    const r = evaluate(tokenTransfer(), basePolicy(), ledger())
    assert.equal(r.action, 'allow')
  })

  it('allows an x402 payment to an allowlisted host', () => {
    const r = evaluate(x402Payment(), basePolicy(), ledger())
    assert.equal(r.action, 'allow')
  })

  it('allows a vault withdraw under limits', () => {
    const r = evaluate(vaultWithdraw(), basePolicy(), ledger())
    assert.equal(r.action, 'allow')
  })

  it('allows amount exactly equal to max_per_tx (inclusive)', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(5) }),
      basePolicy(),
      ledger(),
    )
    assert.equal(r.action, 'allow')
  })

  it('allows a tx that exactly hits the daily cap', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(5) }),
      basePolicy(),
      ledger({ spent_today_base_units: USDC(45) }),
    )
    assert.equal(r.action, 'allow')
  })
})

describe('PolicyGuard — deny paths', () => {
  it('denies amount over max_per_tx', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(10) }),
      basePolicy(),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'amount')
  })

  it('denies when projected daily total exceeds cap', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(4) }),
      basePolicy(),
      ledger({ spent_today_base_units: USDC(48) }),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'daily')
  })

  it('denies a program not in the allowlist', () => {
    const r = evaluate(
      tokenTransfer({ program_id: BAD_PROGRAM }),
      basePolicy({ denied_program_ids: [] }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'program')
  })

  it('denies a program in the denylist even if also allowlisted', () => {
    const r = evaluate(
      tokenTransfer({ program_id: BAD_PROGRAM }),
      basePolicy({
        allowed_program_ids: [BAD_PROGRAM, TOKEN_PROGRAM],
        denied_program_ids: [BAD_PROGRAM],
      }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'denylist')
  })

  it('denies a mint not in the allowlist', () => {
    const r = evaluate(
      tokenTransfer({ mint: WSOL_MINT }),
      basePolicy(),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'mint')
  })

  it('denies an x402 payment to a non-allowlisted host', () => {
    const r = evaluate(
      x402Payment({ host: 'evil.example.com' }),
      basePolicy(),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'host')
  })

  it('denies after policy expiry slot', () => {
    const r = evaluate(
      tokenTransfer(),
      basePolicy({ expiry_slot: 200_000_000 }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'expiry')
  })

  it('does NOT expire when expiry_slot is null', () => {
    const r = evaluate(
      tokenTransfer(),
      basePolicy({ expiry_slot: null }),
      ledger({ current_slot: 999_999_999 }),
    )
    assert.equal(r.action, 'allow')
  })
})

describe('PolicyGuard — queue (manual review threshold)', () => {
  it('queues amount above review threshold but under max_per_tx', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(3) }),
      basePolicy({ require_review_above_base_units: USDC(2) }),
      ledger(),
    )
    assert.equal(r.action, 'queue')
  })

  it('allows when amount equals the review threshold (strict gt)', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(2) }),
      basePolicy({ require_review_above_base_units: USDC(2) }),
      ledger(),
    )
    assert.equal(r.action, 'allow')
  })

  it('does not queue when review threshold is null', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(4) }),
      basePolicy({ require_review_above_base_units: null }),
      ledger(),
    )
    assert.equal(r.action, 'allow')
  })

  it('denies (not queues) when amount is above both review threshold and max_per_tx', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(10) }),
      basePolicy({ require_review_above_base_units: USDC(2) }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'amount')
  })
})

describe('PolicyGuard — schema rejections', () => {
  it('denies zero amount via schema', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: 0 }),
      basePolicy(),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'schema')
  })

  it('denies negative amount via schema', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: -1 }),
      basePolicy(),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'schema')
  })

  it('denies a policy where max_per_day < max_per_tx', () => {
    const r = evaluate(
      tokenTransfer(),
      basePolicy({
        max_per_tx_base_units: USDC(50),
        max_per_day_base_units: USDC(10),
      }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'schema')
  })

  it('denies malformed pubkey in intent.program_id via schema', () => {
    const r = evaluate(
      tokenTransfer({ program_id: 'not-a-pubkey!' }),
      basePolicy(),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'schema')
  })
})

describe('PolicyGuard — edge cases', () => {
  it('denies when allowed_program_ids is empty (safe default)', () => {
    const r = evaluate(
      tokenTransfer(),
      basePolicy({ allowed_program_ids: [] }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'program')
  })

  it('denies when allowed_token_mints is empty', () => {
    const r = evaluate(
      tokenTransfer(),
      basePolicy({ allowed_token_mints: [] }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'mint')
  })

  it('denies x402 when allowed_x402_hosts is empty', () => {
    const r = evaluate(
      x402Payment(),
      basePolicy({ allowed_x402_hosts: [] }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'host')
  })

  it('denies one micro-USDC over the daily cap', () => {
    const r = evaluate(
      tokenTransfer({ amount_base_units: USDC(5) }),
      basePolicy(),
      ledger({ spent_today_base_units: USDC(45) + 1 }),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'daily')
  })

  it('check ordering — expiry beats mint check', () => {
    const r = evaluate(
      tokenTransfer({ mint: WSOL_MINT }),
      basePolicy({ expiry_slot: 100, allowed_token_mints: [USDC_MINT] }),
      ledger({ current_slot: 200 }),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'expiry')
  })

  it('check ordering — denylist beats allowlist', () => {
    const r = evaluate(
      tokenTransfer({ program_id: BAD_PROGRAM, mint: WSOL_MINT }),
      basePolicy({
        allowed_program_ids: [BAD_PROGRAM, TOKEN_PROGRAM],
        denied_program_ids: [BAD_PROGRAM],
      }),
      ledger(),
    )
    assert.equal(r.action, 'deny')
    if (r.action === 'deny') assert.equal(r.denied_by, 'denylist')
  })

  it('returns the policy id on every result', () => {
    const allow = evaluate(
      tokenTransfer(),
      basePolicy({ id: 'pol_abc' }),
      ledger(),
    )
    assert.equal(allow.policy_id, 'pol_abc')

    const deny = evaluate(
      tokenTransfer({ amount_base_units: USDC(100) }),
      basePolicy({ id: 'pol_abc' }),
      ledger(),
    )
    assert.equal(deny.policy_id, 'pol_abc')
  })
})
