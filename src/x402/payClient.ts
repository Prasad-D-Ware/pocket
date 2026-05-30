// src/x402/payClient.ts
//
// Platform-agnostic wrapper around the x402-solana client (PayAI's
// reference implementation, recommended by solana.com/x402 docs).
//
// This is the SAME wrapper used by:
//   - tools/x402-server/test-client.ts (Node smoke, uses a Keypair
//     WalletAdapter — Day 9)
//   - src/app/x402-test.tsx (RN, uses a Keystore-backed WalletAdapter
//     — Day 10)
//
// The Keystore-backed adapter on RN is where the policy story closes:
// every signTransaction request lands on the Android Keystore via
// the pocketSigner pipeline.

import { createX402Client, type WalletAdapter } from 'x402-solana/client'

export type PocketPayClientConfig = {
  /**
   * The wallet that authorizes payments. On RN this wraps Pocket
   * Keystore; in Node tests this wraps a plain Keypair.
   */
  wallet: WalletAdapter
  /** Devnet by default — flip to "solana" only post-grant. */
  network?: 'solana' | 'solana-devnet'
  /** Custom RPC URL; defaults to the x402-solana public endpoint. */
  rpcUrl?: string
  /**
   * Hard cap on a single payment, in atomic units of the asset.
   * 0 (the default) means no cap. Use this as a belt against runaway
   * agent spending until the on-chain pocket_vault policy is the
   * primary enforcer.
   */
  maxAmountAtomic?: bigint
  /** Override the global fetch — useful for proxying around CORS. */
  customFetch?: typeof fetch
  /** Verbose logging from x402-solana. */
  verbose?: boolean
}

export type PocketPayClient = {
  /**
   * Same signature as window.fetch, with automatic x402 handling:
   * if the response is 402 with a payment challenge, the client
   * builds + signs + submits the payment, retries the request with
   * the payment proof, and returns the final response.
   */
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export function createPocketPayClient(
  config: PocketPayClientConfig,
): PocketPayClient {
  const client = createX402Client({
    wallet: config.wallet,
    network: config.network ?? 'solana-devnet',
    rpcUrl: config.rpcUrl,
    amount: config.maxAmountAtomic ?? 0n,
    customFetch: config.customFetch,
    verbose: config.verbose,
  })
  return {
    fetch: (input, init) => client.fetch(input as RequestInfo, init),
  }
}
