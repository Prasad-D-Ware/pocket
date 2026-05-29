// Pure tx decoder. Takes already-parsed instructions (program_id + accounts
// as base58 strings, data as Uint8Array) and turns them into a structured,
// human-readable form. The kit-specific extraction (CompilableTransaction →
// RawInstruction[]) is a thin shim that lives outside src/policy/.
//
// Goals:
// - Never throw. Unknown / malformed input degrades to kind 'unknown'.
// - Zero external imports beyond TextDecoder (a global).
// - Output is the source of truth for the Agent Inbox display AND the
//   structured Intent that feeds PolicyGuard.

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'
export const SPL_TOKEN_PROGRAM_ID =
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const TOKEN_2022_PROGRAM_ID =
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
export const MEMO_PROGRAM_ID =
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'

export type RawInstruction = {
  program_id: string
  accounts: string[]
  data: Uint8Array
}

export type RawTransaction = {
  fee_payer: string
  instructions: RawInstruction[]
  recent_blockhash?: string
}

export type DecodedSystemTransfer = {
  kind: 'system_transfer'
  program_id: string
  from: string
  to: string
  lamports: number
}

export type DecodedSplTokenTransfer = {
  kind: 'spl_token_transfer'
  program_id: string
  variant: 'transfer' | 'transfer_checked'
  source: string
  destination: string
  owner: string
  mint?: string
  decimals?: number
  amount_base_units: number
}

export type DecodedMemo = {
  kind: 'memo'
  program_id: string
  message: string
}

export type DecodedAnchorCall = {
  kind: 'anchor_call'
  program_id: string
  discriminator_hex: string
  data_hex: string
  accounts: string[]
}

export type DecodedUnknown = {
  kind: 'unknown'
  program_id: string
  data_hex: string
  accounts: string[]
}

export type DecodedInstruction =
  | DecodedSystemTransfer
  | DecodedSplTokenTransfer
  | DecodedMemo
  | DecodedAnchorCall
  | DecodedUnknown

export type DecodedTx = {
  fee_payer: string
  recent_blockhash?: string
  instructions: DecodedInstruction[]
  summary: string
}

export function decodeTransaction(raw: RawTransaction): DecodedTx {
  const instructions = raw.instructions.map(decodeInstruction)
  return {
    fee_payer: raw.fee_payer,
    recent_blockhash: raw.recent_blockhash,
    instructions,
    summary: summarize(instructions),
  }
}

export function decodeInstruction(raw: RawInstruction): DecodedInstruction {
  if (raw.program_id === SYSTEM_PROGRAM_ID) {
    return decodeSystem(raw) ?? unknown(raw)
  }
  if (
    raw.program_id === SPL_TOKEN_PROGRAM_ID ||
    raw.program_id === TOKEN_2022_PROGRAM_ID
  ) {
    return decodeToken(raw) ?? unknown(raw)
  }
  if (raw.program_id === MEMO_PROGRAM_ID) {
    return {
      kind: 'memo',
      program_id: MEMO_PROGRAM_ID,
      message: new TextDecoder().decode(raw.data),
    }
  }
  // Heuristic: any other program with at least 8 bytes of data looks like an
  // Anchor call (8-byte sighash discriminator). Without the program IDL we
  // can't decode arguments — surface the discriminator hex so the user can
  // recognize it and so PolicyGuard can match against allowlists.
  if (raw.data.length >= 8) {
    return {
      kind: 'anchor_call',
      program_id: raw.program_id,
      discriminator_hex: bytesToHex(raw.data.slice(0, 8)),
      data_hex: bytesToHex(raw.data),
      accounts: raw.accounts,
    }
  }
  return unknown(raw)
}

function decodeSystem(raw: RawInstruction): DecodedInstruction | null {
  if (raw.data.length < 4) return null
  const disc = readU32LE(raw.data, 0)
  if (disc === 2) {
    if (raw.data.length < 12 || raw.accounts.length < 2) return null
    const lamports = readU64ToNumber(raw.data, 4)
    if (lamports === null) return null
    return {
      kind: 'system_transfer',
      program_id: SYSTEM_PROGRAM_ID,
      from: raw.accounts[0]!,
      to: raw.accounts[1]!,
      lamports,
    }
  }
  return null
}

function decodeToken(raw: RawInstruction): DecodedInstruction | null {
  if (raw.data.length < 1) return null
  const disc = raw.data[0]
  if (disc === 3) {
    if (raw.data.length < 9 || raw.accounts.length < 3) return null
    const amount = readU64ToNumber(raw.data, 1)
    if (amount === null) return null
    return {
      kind: 'spl_token_transfer',
      program_id: raw.program_id,
      variant: 'transfer',
      source: raw.accounts[0]!,
      destination: raw.accounts[1]!,
      owner: raw.accounts[2]!,
      amount_base_units: amount,
    }
  }
  if (disc === 12) {
    if (raw.data.length < 10 || raw.accounts.length < 4) return null
    const amount = readU64ToNumber(raw.data, 1)
    if (amount === null) return null
    return {
      kind: 'spl_token_transfer',
      program_id: raw.program_id,
      variant: 'transfer_checked',
      source: raw.accounts[0]!,
      mint: raw.accounts[1]!,
      destination: raw.accounts[2]!,
      owner: raw.accounts[3]!,
      amount_base_units: amount,
      decimals: raw.data[9]!,
    }
  }
  return null
}

function unknown(raw: RawInstruction): DecodedUnknown {
  return {
    kind: 'unknown',
    program_id: raw.program_id,
    data_hex: bytesToHex(raw.data),
    accounts: raw.accounts,
  }
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  )
}

function readU64ToNumber(bytes: Uint8Array, offset: number): number | null {
  let v = 0n
  for (let i = 0; i < 8; i++) {
    v |= BigInt(bytes[offset + i]!) << BigInt(i * 8)
  }
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(v)
}

function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, '0')
  }
  return s
}

function summarize(ixs: DecodedInstruction[]): string {
  const parts: string[] = []
  for (const ix of ixs) {
    switch (ix.kind) {
      case 'system_transfer':
        parts.push(
          `Send ${(ix.lamports / 1e9).toFixed(4)} SOL to ${truncate(ix.to)}`,
        )
        break
      case 'spl_token_transfer': {
        const amt =
          ix.decimals !== undefined
            ? (ix.amount_base_units / 10 ** ix.decimals).toString()
            : ix.amount_base_units.toString()
        const tag = ix.decimals !== undefined ? ' tokens' : ' base units'
        parts.push(`Token transfer ${amt}${tag} to ${truncate(ix.destination)}`)
        break
      }
      case 'memo':
        parts.push(`Memo: "${ix.message}"`)
        break
      case 'anchor_call':
        parts.push(
          `Call ${truncate(ix.program_id)} (sighash ${ix.discriminator_hex})`,
        )
        break
      case 'unknown':
        parts.push(`Unknown call to ${truncate(ix.program_id)}`)
        break
    }
  }
  return parts.join(' · ')
}

function truncate(s: string): string {
  if (s.length <= 12) return s
  return s.slice(0, 6) + '...' + s.slice(-4)
}
