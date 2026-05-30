// One-line, human-readable Intent summary used by the inbox UI. Sits
// next to the queue so the rendering layer and the queue stay
// decoupled — the inbox screen never needs to know the Intent shape.

import type { Intent } from '../policy/schema'

const USDC_DECIMALS = 6

export function summarizeIntent(intent: Intent): string {
  switch (intent.kind) {
    case 'token_transfer':
      return `Send ${fmt(intent.amount_base_units)} → ${short(intent.recipient)}`
    case 'x402_payment':
      return `Pay ${fmt(intent.amount_base_units)} to ${intent.host}`
    case 'vault_withdraw':
      return `Vault withdraw ${fmt(intent.amount_base_units)} → ${short(intent.recipient)}`
  }
}

export function fmtUsdc(baseUnits: number): string {
  return fmt(baseUnits)
}

function fmt(baseUnits: number): string {
  const ui = baseUnits / 10 ** USDC_DECIMALS
  return `${ui.toFixed(USDC_DECIMALS).replace(/\.?0+$/, '')} USDC`
}

function short(s: string): string {
  if (s.length <= 12) return s
  return s.slice(0, 6) + '…' + s.slice(-4)
}
