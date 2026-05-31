import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { llmIntentToIntent, validateLLMIntent, type LLMIntent } from '../expander'
import { USDC_DECIMALS, USDC_MINT_BASE58 } from '../grammar'

// Tests the pure LLMIntent → Intent expander. The llama.rn-driven
// parseIntent() is RN-only and exercised via the /parser-test screen
// benchmark instead.

describe('llmIntentToIntent', () => {
  it('expands token_transfer with USDC base units + USDC mint', () => {
    const llm: LLMIntent = {
      kind: 'token_transfer',
      amount_usd: 2.5,
      recipient: 'alice.sol',
    }
    const intent = llmIntentToIntent(llm, 'user', 1_710_000_000_000)
    assert.ok(intent)
    if (intent && intent.kind === 'token_transfer') {
      assert.equal(intent.amount_base_units, 2_500_000)
      assert.equal(intent.mint, USDC_MINT_BASE58)
      assert.equal(intent.recipient, 'alice.sol')
      assert.equal(intent.source, 'user')
      assert.equal(intent.requested_at_ms, 1_710_000_000_000)
    }
  })

  it('expands x402_payment with host + https URL + USDC base units', () => {
    const llm: LLMIntent = {
      kind: 'x402_payment',
      amount_usd: 0.5,
      host: 'api.helius.dev',
    }
    const intent = llmIntentToIntent(llm)
    assert.ok(intent)
    if (intent && intent.kind === 'x402_payment') {
      assert.equal(intent.host, 'api.helius.dev')
      assert.equal(intent.url, 'https://api.helius.dev')
      assert.equal(intent.amount_base_units, 500_000)
      assert.equal(intent.mint, USDC_MINT_BASE58)
    }
  })

  it('returns null for refuse — caller treats as "no Intent to enqueue"', () => {
    const llm: LLMIntent = {
      kind: 'refuse',
      reason: 'not a payment intent',
    }
    assert.equal(llmIntentToIntent(llm), null)
  })

  it('rounds fractional amounts cleanly at USDC decimals (6)', () => {
    const llm: LLMIntent = {
      kind: 'token_transfer',
      amount_usd: 0.000001,
      recipient: 'alice',
    }
    const intent = llmIntentToIntent(llm)
    if (intent && intent.kind === 'token_transfer') {
      assert.equal(intent.amount_base_units, 1)
    }
  })

  it('honors source override (agent for inbox auto-routing flows)', () => {
    const llm: LLMIntent = {
      kind: 'token_transfer',
      amount_usd: 1,
      recipient: 'bob',
    }
    const intent = llmIntentToIntent(llm, 'agent')
    assert.equal(intent?.source, 'agent')
  })

  it('default source is "user" — typed sentences are user-originated', () => {
    const llm: LLMIntent = {
      kind: 'x402_payment',
      amount_usd: 1,
      host: 'api.helius.dev',
    }
    const intent = llmIntentToIntent(llm)
    assert.equal(intent?.source, 'user')
  })

  it('uses USDC_DECIMALS to compute base units — refactor-safe', () => {
    const llm: LLMIntent = {
      kind: 'token_transfer',
      amount_usd: 1,
      recipient: 'a',
    }
    const intent = llmIntentToIntent(llm)
    if (intent && intent.kind === 'token_transfer') {
      assert.equal(intent.amount_base_units, 10 ** USDC_DECIMALS)
    }
  })
})

describe('validateLLMIntent', () => {
  it('accepts a valid token_transfer shape', () => {
    const v = validateLLMIntent({
      kind: 'token_transfer',
      amount_usd: 1,
      recipient: 'alice',
    })
    assert.deepEqual(v, {
      kind: 'token_transfer',
      amount_usd: 1,
      recipient: 'alice',
    })
  })

  it('accepts a valid x402_payment shape', () => {
    const v = validateLLMIntent({
      kind: 'x402_payment',
      amount_usd: 0.5,
      host: 'api.helius.dev',
    })
    assert.ok(v && v.kind === 'x402_payment')
  })

  it('accepts refuse with reason', () => {
    const v = validateLLMIntent({ kind: 'refuse', reason: 'meh' })
    assert.ok(v && v.kind === 'refuse')
  })

  it('rejects unknown kind', () => {
    assert.equal(
      validateLLMIntent({ kind: 'set_policy', amount_usd: 1 }),
      null,
    )
  })

  it('rejects token_transfer with wrong amount type', () => {
    assert.equal(
      validateLLMIntent({
        kind: 'token_transfer',
        amount_usd: '1',
        recipient: 'a',
      }),
      null,
    )
  })

  it('rejects x402_payment missing host', () => {
    assert.equal(
      validateLLMIntent({ kind: 'x402_payment', amount_usd: 1 }),
      null,
    )
  })

  it('rejects refuse missing reason', () => {
    assert.equal(validateLLMIntent({ kind: 'refuse' }), null)
  })

  it('rejects non-object input', () => {
    assert.equal(validateLLMIntent('hello'), null)
    assert.equal(validateLLMIntent(42), null)
    assert.equal(validateLLMIntent(null), null)
  })
})
