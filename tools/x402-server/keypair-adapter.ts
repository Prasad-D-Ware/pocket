import { Keypair, type VersionedTransaction } from '@solana/web3.js'
import type { WalletAdapter } from 'x402-solana/client'

// Node-only WalletAdapter for the Day 9 smoke test. RN gets a
// separate Keystore-backed adapter on Day 10 — that's the real
// money path.
export function keypairWalletAdapter(keypair: Keypair): WalletAdapter {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: VersionedTransaction) => {
      tx.sign([keypair])
      return tx
    },
  }
}
