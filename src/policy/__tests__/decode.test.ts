import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeInstruction,
  decodeTransaction,
  MEMO_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  type RawInstruction,
} from '../decode'

const A = '7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs'
const B = '9LXVm6KrLNh1qDX2VRTpVwQDqMTKKbsWMcDmTV8YfHmL'
const OWNER = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const POCKET_VAULT = 'PCketVau1t1111111111111111111111111111111111'

function u8(n: number): number {
  return n & 0xff
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4)
  b[0] = u8(n)
  b[1] = u8(n >>> 8)
  b[2] = u8(n >>> 16)
  b[3] = u8(n >>> 24)
  return b
}

function u64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8)
  let v = typeof n === 'bigint' ? n : BigInt(n)
  for (let i = 0; i < 8; i++) {
    b[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return b
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

describe('decoder — system program', () => {
  it('decodes a 0.5 SOL system transfer', () => {
    const ix: RawInstruction = {
      program_id: SYSTEM_PROGRAM_ID,
      accounts: [A, B],
      data: concat(u32le(2), u64le(500_000_000)),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'system_transfer')
    if (d.kind === 'system_transfer') {
      assert.equal(d.from, A)
      assert.equal(d.to, B)
      assert.equal(d.lamports, 500_000_000)
    }
  })

  it('falls back to unknown for a truncated system transfer', () => {
    const ix: RawInstruction = {
      program_id: SYSTEM_PROGRAM_ID,
      accounts: [A, B],
      data: concat(u32le(2), new Uint8Array(4)), // 4 bytes of u64 missing
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'unknown')
  })

  it('falls back to unknown for an unrecognized system discriminator', () => {
    const ix: RawInstruction = {
      program_id: SYSTEM_PROGRAM_ID,
      accounts: [A, B],
      data: concat(u32le(99), u64le(0)),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'unknown')
  })
})

describe('decoder — SPL token program', () => {
  it('decodes a legacy SPL Token Transfer of 1 USDC', () => {
    const ix: RawInstruction = {
      program_id: SPL_TOKEN_PROGRAM_ID,
      accounts: [A, B, OWNER],
      data: concat(new Uint8Array([3]), u64le(1_000_000)),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'spl_token_transfer')
    if (d.kind === 'spl_token_transfer') {
      assert.equal(d.variant, 'transfer')
      assert.equal(d.amount_base_units, 1_000_000)
      assert.equal(d.source, A)
      assert.equal(d.destination, B)
      assert.equal(d.owner, OWNER)
      assert.equal(d.mint, undefined)
      assert.equal(d.decimals, undefined)
    }
  })

  it('decodes a Token2022 TransferChecked of 5 USDC with mint + decimals', () => {
    const ix: RawInstruction = {
      program_id: TOKEN_2022_PROGRAM_ID,
      accounts: [A, USDC_MINT, B, OWNER],
      data: concat(new Uint8Array([12]), u64le(5_000_000), new Uint8Array([6])),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'spl_token_transfer')
    if (d.kind === 'spl_token_transfer') {
      assert.equal(d.variant, 'transfer_checked')
      assert.equal(d.amount_base_units, 5_000_000)
      assert.equal(d.mint, USDC_MINT)
      assert.equal(d.decimals, 6)
    }
  })

  it('falls back to unknown for a truncated TransferChecked', () => {
    const ix: RawInstruction = {
      program_id: TOKEN_2022_PROGRAM_ID,
      accounts: [A, USDC_MINT, B, OWNER],
      data: concat(new Uint8Array([12]), u64le(5_000_000)), // decimals byte missing
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'unknown')
  })
})

describe('decoder — memo program', () => {
  it('decodes a UTF-8 memo', () => {
    const message = 'pocket: paid Helius DAS query'
    const ix: RawInstruction = {
      program_id: MEMO_PROGRAM_ID,
      accounts: [],
      data: new TextEncoder().encode(message),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'memo')
    if (d.kind === 'memo') assert.equal(d.message, message)
  })
})

describe('decoder — anchor calls', () => {
  it('decodes a pocket_vault Anchor call as anchor_call with hex discriminator', () => {
    // 8-byte fake sighash + 8-byte u64 amount
    const sighash = new Uint8Array([
      0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
    ])
    const ix: RawInstruction = {
      program_id: POCKET_VAULT,
      accounts: [A, USDC_MINT, B, OWNER],
      data: concat(sighash, u64le(2_000_000)),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'anchor_call')
    if (d.kind === 'anchor_call') {
      assert.equal(d.program_id, POCKET_VAULT)
      assert.equal(d.discriminator_hex, 'abcdef0123456789')
      assert.equal(d.accounts.length, 4)
    }
  })

  it('falls back to unknown for a non-system, non-token call with < 8 bytes', () => {
    const ix: RawInstruction = {
      program_id: POCKET_VAULT,
      accounts: [A],
      data: new Uint8Array([0x01, 0x02, 0x03]),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'unknown')
  })
})

describe('decoder — full transaction', () => {
  it('decodes a multi-instruction tx (memo + token transfer) and builds a summary', () => {
    const memoMsg = 'paid api.helius.dev'
    const decoded = decodeTransaction({
      fee_payer: OWNER,
      recent_blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
      instructions: [
        {
          program_id: MEMO_PROGRAM_ID,
          accounts: [],
          data: new TextEncoder().encode(memoMsg),
        },
        {
          program_id: SPL_TOKEN_PROGRAM_ID,
          accounts: [A, B, OWNER],
          data: concat(new Uint8Array([3]), u64le(500_000)),
        },
      ],
    })
    assert.equal(decoded.instructions.length, 2)
    assert.equal(decoded.instructions[0]!.kind, 'memo')
    assert.equal(decoded.instructions[1]!.kind, 'spl_token_transfer')
    assert.match(decoded.summary, /Memo: "paid api\.helius\.dev"/)
    assert.match(decoded.summary, /Token transfer/)
  })

  it('returns kind=unknown for an unrecognized program with empty data', () => {
    const ix: RawInstruction = {
      program_id: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
      accounts: [],
      data: new Uint8Array(0),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'unknown')
  })

  it('safely returns unknown for a u64 amount exceeding MAX_SAFE_INTEGER', () => {
    const huge = (1n << 60n) // 2^60, well above 2^53
    const ix: RawInstruction = {
      program_id: SPL_TOKEN_PROGRAM_ID,
      accounts: [A, B, OWNER],
      data: concat(new Uint8Array([3]), u64le(huge)),
    }
    const d = decodeInstruction(ix)
    assert.equal(d.kind, 'unknown')
  })
})
