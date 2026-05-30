import { existsSync, readFileSync } from 'node:fs'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import { createPocketPayClient } from '../../src/x402/payClient.ts'
import { keypairWalletAdapter } from './keypair-adapter.ts'
import {
  DEVNET_RPC,
  FAKE_USDC_DECIMALS,
  FAKE_USDC_MINT,
  PORT,
  TEST_WALLET_PATH,
} from './constants.ts'

const SERVER_URL =
  process.env.SERVER_URL ?? `http://localhost:${PORT}/api/quote`
// Hard cap a single payment to 0.05 fake-USDC during the smoke. Server
// asks for 0.01 — anything dramatically larger would be a misconfig.
const MAX_AMOUNT_ATOMIC = 50_000n

async function main() {
  if (!existsSync(TEST_WALLET_PATH)) {
    throw new Error(
      `No test wallet at ${TEST_WALLET_PATH}. Run \`npm run fund\` first.`,
    )
  }
  const secret = JSON.parse(readFileSync(TEST_WALLET_PATH, 'utf-8')) as number[]
  const kp = Keypair.fromSecretKey(Uint8Array.from(secret))

  console.log('paying as:', kp.publicKey.toBase58())
  await reportBalances(kp.publicKey)

  const client = createPocketPayClient({
    wallet: keypairWalletAdapter(kp),
    network: 'solana-devnet',
    rpcUrl: DEVNET_RPC,
    maxAmountAtomic: MAX_AMOUNT_ATOMIC,
    verbose: process.env.VERBOSE === '1',
  })

  console.log(`\nGET ${SERVER_URL}`)
  const res = await client.fetch(SERVER_URL)
  const body = await res.json().catch(() => ({}))
  console.log('  status:', res.status)
  console.log('  body  :', JSON.stringify(body, null, 2))

  console.log('\npost-payment balances:')
  await reportBalances(kp.publicKey)

  if (res.status !== 200) {
    console.error('\nNon-200 response — smoke failed.')
    process.exit(1)
  }
  console.log('\n✓ smoke passed — server returned the paid resource after x402 settlement.')
}

async function reportBalances(addr: PublicKey) {
  const conn = new Connection(DEVNET_RPC, 'confirmed')
  const sol = await conn.getBalance(addr, 'confirmed')
  console.log(`  SOL: ${sol / LAMPORTS_PER_SOL}`)
  try {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(FAKE_USDC_MINT),
      addr,
    )
    const usdc = await conn.getTokenAccountBalance(ata, 'confirmed')
    console.log(
      `  fake-USDC: ${usdc.value.uiAmountString} (${FAKE_USDC_DECIMALS} dec)`,
    )
  } catch {
    console.log('  fake-USDC: ATA missing — run `npm run fund`')
  }
}

await main().catch((e) => {
  console.error(e)
  process.exit(1)
})
