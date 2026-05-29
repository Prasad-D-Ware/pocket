import {
  IntentSchema,
  LedgerSnapshotSchema,
  PolicySchema,
  type Intent,
  type LedgerSnapshot,
  type Policy,
  type PolicyResult,
} from './schema'

// Pure function: no I/O, no clock access, no side effects.
// All time/slot/day-window state comes from the LedgerSnapshot so the
// guard is fully deterministic and unit-testable.
export function evaluate(
  intent: Intent,
  policy: Policy,
  ledger: LedgerSnapshot,
): PolicyResult {
  const policy_id = policy?.id ?? 'unknown'

  // Defense in depth: structurally invalid input → deny via 'schema'.
  // We do not throw; the guard's contract is "always returns a decision".
  const policyParse = PolicySchema.safeParse(policy)
  if (!policyParse.success) {
    return {
      action: 'deny',
      policy_id,
      reason: `invalid policy: ${policyParse.error.issues[0]?.message ?? 'unknown'}`,
      denied_by: 'schema',
    }
  }
  const intentParse = IntentSchema.safeParse(intent)
  if (!intentParse.success) {
    return {
      action: 'deny',
      policy_id,
      reason: `invalid intent: ${intentParse.error.issues[0]?.message ?? 'unknown'}`,
      denied_by: 'schema',
    }
  }
  const ledgerParse = LedgerSnapshotSchema.safeParse(ledger)
  if (!ledgerParse.success) {
    return {
      action: 'deny',
      policy_id,
      reason: `invalid ledger: ${ledgerParse.error.issues[0]?.message ?? 'unknown'}`,
      denied_by: 'schema',
    }
  }

  // Expiry beats everything except schema failures.
  if (policy.expiry_slot !== null && ledger.current_slot > policy.expiry_slot) {
    return {
      action: 'deny',
      policy_id,
      reason: `policy expired at slot ${policy.expiry_slot}`,
      denied_by: 'expiry',
    }
  }

  // Denylist takes precedence over allowlist.
  if (policy.denied_program_ids.includes(intent.program_id)) {
    return {
      action: 'deny',
      policy_id,
      reason: `program ${intent.program_id} is denylisted`,
      denied_by: 'denylist',
    }
  }

  // Empty allowlist = nothing allowed (safe default).
  if (!policy.allowed_program_ids.includes(intent.program_id)) {
    return {
      action: 'deny',
      policy_id,
      reason: `program ${intent.program_id} not in allowlist`,
      denied_by: 'program',
    }
  }

  if (!policy.allowed_token_mints.includes(intent.mint)) {
    return {
      action: 'deny',
      policy_id,
      reason: `mint ${intent.mint} not in allowlist`,
      denied_by: 'mint',
    }
  }

  if (intent.kind === 'x402_payment') {
    if (!policy.allowed_x402_hosts.includes(intent.host)) {
      return {
        action: 'deny',
        policy_id,
        reason: `host ${intent.host} not in x402 allowlist`,
        denied_by: 'host',
      }
    }
  }

  if (intent.amount_base_units > policy.max_per_tx_base_units) {
    return {
      action: 'deny',
      policy_id,
      reason: `amount ${intent.amount_base_units} exceeds max_per_tx ${policy.max_per_tx_base_units}`,
      denied_by: 'amount',
    }
  }

  const projected_spent =
    ledger.spent_today_base_units + intent.amount_base_units
  if (projected_spent > policy.max_per_day_base_units) {
    return {
      action: 'deny',
      policy_id,
      reason: `daily total ${projected_spent} would exceed cap ${policy.max_per_day_base_units}`,
      denied_by: 'daily',
    }
  }

  const review_threshold = policy.require_review_above_base_units
  if (
    review_threshold !== null &&
    intent.amount_base_units > review_threshold
  ) {
    return {
      action: 'queue',
      policy_id,
      reason: `amount ${intent.amount_base_units} above review threshold ${review_threshold}`,
    }
  }

  return { action: 'allow', policy_id }
}
