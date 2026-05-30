import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
  TEST_WALLET_PATH,
} from './constants.ts'

const FAKE_USDC_TO_MINT = 5 // 5 fake-USDC, plenty for 500 paid calls at 0.01 each
const SOL_AIRDROP_LAMPORTS = LAMPORTS_PER_SOL / 2 // 0.5 SOL for fees
const MIN_SOL_BALANCE = 0.1 * LAMPORTS_PER_SOL

async function main() {
  if (!existsSync(SOLANA_CLI_KEYPAIR)) {
    throw new Error(
      `Solana CLI keypair not found at ${SOLANA_CLI_KEYPAIR}. Either install solana-cli or set SOLANA_CLI_KEYPAIR.`,
    )
  }
  const treasury = loadKeypair(SOLANA_CLI_KEYPAIR)
  const testWallet = loadOrCreateTestWallet(TEST_WALLET_PATH)

  console.log('treasury (mint authority + payment recipient):')
  console.log('  ', treasury.publicKey.toBase58())
  console.log('test wallet (will pay for x402 requests):')
  console.log('  ', testWallet.publicKey.toBase58())

  const conn = new Connection(DEVNET_RPC, 'confirmed')

  const balance = await conn.getBalance(testWallet.publicKey)
  console.log(`\nSOL balance: ${balance / LAMPORTS_PER_SOL}`)
  if (balance < MIN_SOL_BALANCE) {
    console.log('  funding 0.5 SOL…')
    await fundSol(conn, treasury, testWallet.publicKey, SOL_AIRDROP_LAMPORTS)
  }

  console.log('\nensuring fake-USDC ATA for test wallet…')
  const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    treasury,
    new PublicKey(FAKE_USDC_MINT),
    testWallet.publicKey,
  )
  console.log('  ATA:', ata.address.toBase58())

  const amount = FAKE_USDC_TO_MINT * 10 ** FAKE_USDC_DECIMALS
  console.log(`\nminting ${FAKE_USDC_TO_MINT} fake-USDC…`)
  const mintSig = await mintTo(
    conn,
    treasury,
    new PublicKey(FAKE_USDC_MINT),
    ata.address,
    treasury.publicKey,
    amount,
  )
  console.log('  mint sig:', mintSig)

  const post = await conn.getTokenAccountBalance(ata.address, 'confirmed')
  console.log(`\nfake-USDC balance: ${post.value.uiAmountString}`)
  console.log('\nReady. Run `npm run server` then `npm run smoke`.')
}

// Try the devnet faucet first; fall back to a direct transfer from
// treasury if the faucet is rate-limited (very common). Both paths end
// with the same outcome: test wallet has SOL for fees.
async function fundSol(
  conn: Connection,
  treasury: Keypair,
  to: PublicKey,
  lamportsAmount: number,
) {
  try {
    const sig = await conn.requestAirdrop(to, lamportsAmount)
    await conn.confirmTransaction(sig, 'confirmed')
    console.log('  airdrop confirmed:', sig)
    return
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (!/429|rate|limit|faucet/i.test(msg)) throw e
    console.log('  faucet rate-limited; falling back to treasury transfer')
  }

  const ix = SystemProgram.transfer({
    fromPubkey: treasury.publicKey,
    toPubkey: to,
    lamports: lamportsAmount,
  })
  const tx = new Transaction().add(ix)
  const sig = await sendAndConfirmTransaction(conn, tx, [treasury], {
    commitment: 'confirmed',
    skipPreflight: false,
    maxRetries: 5,
  })
  console.log('  treasury transfer:', sig)
}

function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(path, 'utf-8')) as number[]
  return Keypair.fromSecretKey(Uint8Array.from(secret))
}

function loadOrCreateTestWallet(path: string): Keypair {
  if (existsSync(path)) return loadKeypair(path)
  const kp = Keypair.generate()
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)))
  console.log('generated new test wallet at', path)
  return kp
}

await main().catch((e) => {
  console.error(e)
  process.exit(1)
})
