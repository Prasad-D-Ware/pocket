// Pure LLMIntent → Intent expander. No imports from llama.rn or
// expo-file-system, so this is Node-testable (see __tests__/) and
// reusable from the inbox path without dragging the LLM runtime
// into modules that don't need it.

import type { Intent } from '../policy/schema'
import {
  PAY_SH_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  USDC_DECIMALS,
  USDC_MINT_BASE58,
} from './grammar'

export type LLMIntent =
  | { kind: 'token_transfer'; amount_usd: number; recipient: string }
  | { kind: 'x402_payment'; amount_usd: number; host: string }
  | { kind: 'refuse'; reason: string }

/**
 * Fills in the operational fields PolicyGuard needs (mint, program
 * IDs, base-units conversion, source, requested_at_ms) from the
 * model's abbreviated semantic output. Returns null for the refuse
 * variant — caller treats that as "no Intent to enqueue."
 */
export function llmIntentToIntent(
  llm: LLMIntent,
  source: 'user' | 'agent' | 'inbox_replay' = 'user',
  now: number = Date.now(),
): Intent | null {
  switch (llm.kind) {
    case 'refuse':
      return null
    case 'token_transfer':
      return {
        kind: 'token_transfer',
        source,
        requested_at_ms: now,
        mint: USDC_MINT_BASE58,
        amount_base_units: Math.round(llm.amount_usd * 10 ** USDC_DECIMALS),
        recipient: llm.recipient,
        program_id: TOKEN_PROGRAM_ID,
      }
    case 'x402_payment':
      return {
        kind: 'x402_payment',
        source,
        requested_at_ms: now,
        host: llm.host,
        url: `https://${llm.host}`,
        mint: USDC_MINT_BASE58,
        amount_base_units: Math.round(llm.amount_usd * 10 ** USDC_DECIMALS),
        program_id: PAY_SH_PROGRAM_ID,
      }
  }
}

/**
 * Structural validator for the model's raw JSON. Returns the typed
 * LLMIntent or null. Defensive against the model emitting unknown
 * shapes even though the grammar should make that structurally
 * impossible — belt + suspenders.
 */
export function validateLLMIntent(v: unknown): LLMIntent | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (
    o.kind === 'token_transfer' &&
    typeof o.amount_usd === 'number' &&
    typeof o.recipient === 'string'
  ) {
    return {
      kind: 'token_transfer',
      amount_usd: o.amount_usd,
      recipient: o.recipient,
    }
  }
  if (
    o.kind === 'x402_payment' &&
    typeof o.amount_usd === 'number' &&
    typeof o.host === 'string'
  ) {
    return { kind: 'x402_payment', amount_usd: o.amount_usd, host: o.host }
  }
  if (o.kind === 'refuse' && typeof o.reason === 'string') {
    return { kind: 'refuse', reason: o.reason }
  }
  return null
}
