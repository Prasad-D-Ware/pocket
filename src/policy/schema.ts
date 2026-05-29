import { z } from 'zod'

// Solana pubkeys are base58, 32-44 chars. Alphabet excludes 0, O, I, l.
const Base58Pubkey = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid base58 Solana pubkey')

const Hostname = z
  .string()
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid hostname')

// Policy is the user's set of rules. Limits are denominated in the
// token's smallest unit (micro-USDC for USDC, lamports for SOL, etc.).
// For v1 we assume USDC (6 decimals): $1 = 1_000_000.
export const PolicySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(64),
    version: z.literal(1),
    max_per_tx_base_units: z.number().int().nonnegative(),
    max_per_day_base_units: z.number().int().nonnegative(),
    // Amounts strictly greater than this require manual approval
    // (action: 'queue'). null = auto-approve everything under max_per_tx.
    require_review_above_base_units: z.number().int().nonnegative().nullable(),
    allowed_program_ids: z.array(Base58Pubkey),
    allowed_token_mints: z.array(Base58Pubkey),
    allowed_x402_hosts: z.array(Hostname),
    denied_program_ids: z.array(Base58Pubkey),
    // Slot after which the policy is invalid. null = never expires.
    expiry_slot: z.number().int().nonnegative().nullable(),
    created_at_ms: z.number().int().positive(),
  })
  .refine((p) => p.max_per_day_base_units >= p.max_per_tx_base_units, {
    message: 'max_per_day must be >= max_per_tx',
  })

export type Policy = z.infer<typeof PolicySchema>

const IntentBase = {
  source: z.enum(['user', 'agent', 'inbox_replay']),
  requested_at_ms: z.number().int().positive(),
}

const TokenTransferIntentSchema = z.object({
  kind: z.literal('token_transfer'),
  ...IntentBase,
  mint: Base58Pubkey,
  amount_base_units: z.number().int().positive(),
  recipient: Base58Pubkey,
  program_id: Base58Pubkey,
})

const X402PaymentIntentSchema = z.object({
  kind: z.literal('x402_payment'),
  ...IntentBase,
  host: Hostname,
  url: z.string().url(),
  mint: Base58Pubkey,
  amount_base_units: z.number().int().positive(),
  program_id: Base58Pubkey,
})

const VaultWithdrawIntentSchema = z.object({
  kind: z.literal('vault_withdraw'),
  ...IntentBase,
  vault: Base58Pubkey,
  mint: Base58Pubkey,
  amount_base_units: z.number().int().positive(),
  recipient: Base58Pubkey,
  program_id: Base58Pubkey,
})

export const IntentSchema = z.discriminatedUnion('kind', [
  TokenTransferIntentSchema,
  X402PaymentIntentSchema,
  VaultWithdrawIntentSchema,
])

export type Intent = z.infer<typeof IntentSchema>

// Ledger snapshot is provided by the caller so the guard stays pure.
// Daily-window rollover is the caller's responsibility — guard just
// trusts the values given.
export const LedgerSnapshotSchema = z.object({
  current_slot: z.number().int().nonnegative(),
  current_time_ms: z.number().int().positive(),
  spent_today_base_units: z.number().int().nonnegative(),
  day_start_ms: z.number().int().positive(),
})

export type LedgerSnapshot = z.infer<typeof LedgerSnapshotSchema>

export const DenyReasonSchema = z.enum([
  'amount',
  'daily',
  'program',
  'mint',
  'host',
  'denylist',
  'expiry',
  'schema',
])
export type DenyReason = z.infer<typeof DenyReasonSchema>

export type PolicyResult =
  | { action: 'allow'; policy_id: string; reason?: string }
  | { action: 'queue'; policy_id: string; reason: string }
  | { action: 'deny'; policy_id: string; reason: string; denied_by: DenyReason }
