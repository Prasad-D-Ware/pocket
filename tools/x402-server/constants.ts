import { homedir } from 'node:os'
import { join } from 'node:path'

// Devnet config — flip to mainnet only post-grant.
export const NETWORK = 'solana-devnet' as const
export const DEVNET_RPC = 'https://api.devnet.solana.com'

// PayAI's hosted facilitator. Free tier; no API key required for low
// volume. Set FACILITATOR_URL env to override.
export const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? 'https://facilitator.payai.network'

// Fake-USDC mint, created during Day 4 testing on devnet. Mint
// authority = the user's solana CLI wallet (7RKbeE...), which the
// funding script reuses to mint to the test client.
export const FAKE_USDC_MINT = 'BofnM1aZaTJfxpoDD82oDJQEcSEyKtHjEEEUujCmE29v'
export const FAKE_USDC_DECIMALS = 6

// Treasury = the wallet that receives x402 payments. Same wallet as
// the mint authority and the original test authority. Override via
// TREASURY_ADDRESS env if you want to keep treasury and dev wallets
// separate.
export const TREASURY_ADDRESS =
  process.env.TREASURY_ADDRESS ??
  '7RKbeEC9ao4hu4BgDsiXXhNFP8JN4GrMBPXBZ7c29nbV'

// Path conventions.
export const SOLANA_CLI_KEYPAIR =
  process.env.SOLANA_CLI_KEYPAIR ?? join(homedir(), '.config/solana/id.json')
export const TEST_WALLET_PATH =
  process.env.TEST_WALLET_PATH ?? join(import.meta.dirname, 'test-wallet.json')
export const PORT = Number(process.env.PORT ?? 4242)
export const QUOTE_PRICE_ATOMIC = '10000' // 0.01 fake-USDC (6 decimals)
