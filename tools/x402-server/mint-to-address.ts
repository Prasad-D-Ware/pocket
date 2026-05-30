import { existsSync, readFileSync } from 'node:fs'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token'

import {
  DEVNET_RPC,
  FAKE_USDC_DECIMALS,
  FAKE_USDC_MINT,
  SOLANA_CLI_KEYPAIR,
} from './constants.ts'

// Mints fake-USDC to an arbitrary address (typically the Pocket
// Keystore address shown on /x402-test). Also tops up SOL if the
// recipient has under 0.01 SOL so the first paid call doesn't fail
// at fee-payer balance.
//
// Usage:
//   npm run mint-to -- <address> [amount-in-fake-USDC]
//
// Defaults: amount = 1.
//
// Treasury (mint authority + SOL source) is the local solana-cli
// keypair — same as fund-test-wallet.ts.

const DEFAULT_FAKE_USDC = 1
const MIN_SOL_BALANCE_LAMPORTS = 0.01 * LAMPORTS_PER_SOL
const SOL_TOPUP_LAMPORTS = 0.05 * LAMPORTS_PER_SOL

async function main() {
  const addressArg = process.argv[2]
  const amountArg = process.argv[3]
  if (!addressArg) {
    console.error('usage: npm run mint-to -- <address> [amount-in-fake-USDC]')
    process.exit(1)
  }

  const recipient = new PublicKey(addressArg)
  const amountFakeUsdc = amountArg ? Number(amountArg) : DEFAULT_FAKE_USDC
  if (!Number.isFinite(amountFakeUsdc) || amountFakeUsdc <= 0) {
    console.error('amount must be a positive number')
    process.exit(1)
  }

  if (!existsSync(SOLANA_CLI_KEYPAIR)) {
    throw new Error(`Solana CLI keypair not found at ${SOLANA_CLI_KEYPAIR}.`)
  }
  const treasury = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(SOLANA_CLI_KEYPAIR, 'utf-8')) as number[],
    ),
  )

  console.log('recipient :', recipient.toBase58())
  console.log('treasury  :', treasury.publicKey.toBase58())
  console.log(`amount    : ${amountFakeUsdc} fake-USDC`)

  const conn = new Connection(DEVNET_RPC, 'confirmed')

  const sol = await conn.getBalance(recipient, 'confirmed')
  console.log(`\nrecipient SOL: ${sol / LAMPORTS_PER_SOL}`)
  if (sol < MIN_SOL_BALANCE_LAMPORTS) {
    console.log('  topping up 0.05 SOL for fees…')
    const ix = SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: recipient,
      lamports: SOL_TOPUP_LAMPORTS,
    })
    const sig = await sendAndConfirmTransaction(
      conn,
      new Transaction().add(ix),
      [treasury],
      { commitment: 'confirmed', maxRetries: 5 },
    )
    console.log('  topup sig:', sig)
  }

  console.log('\nensuring fake-USDC ATA…')
  const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    treasury,
    new PublicKey(FAKE_USDC_MINT),
    recipient,
    true, // allowOwnerOffCurve — harmless for normal keys, needed if recipient is a PDA
  )
  console.log('  ATA:', ata.address.toBase58())

  console.log(`\nminting ${amountFakeUsdc} fake-USDC…`)
  const atomic = Math.round(amountFakeUsdc * 10 ** FAKE_USDC_DECIMALS)
  const mintSig = await mintTo(
    conn,
    treasury,
    new PublicKey(FAKE_USDC_MINT),
    ata.address,
    treasury.publicKey,
    atomic,
  )
  console.log('  mint sig:', mintSig)

  const post = await conn.getTokenAccountBalance(ata.address, 'confirmed')
  console.log(`\nrecipient fake-USDC: ${post.value.uiAmountString}`)
  console.log('\nReady. Reopen the /x402-test screen and tap Refresh.')
}

await main().catch((e) => {
  console.error(e)
  process.exit(1)
})
