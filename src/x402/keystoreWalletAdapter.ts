// src/x402/keystoreWalletAdapter.ts
//
// WalletAdapter (from x402-solana/client) backed by Pocket Keystore.
// This is the RN-side counterpart to tools/x402-server/keypair-adapter.ts.
// Same shape, different signer: the private key lives in Android
// Keystore and never crosses the JNI bridge.
//
// Flow on signTransaction:
//   1. tx.message.serialize() → raw message bytes the validator hashes
//   2. keystore.sign(bytes) → 64-byte Ed25519 signature in the secure
//      enclave
//   3. tx.addSignature(publicKey, sig) — VersionedTransaction finds the
//      right signature slot (it must match a writable signer key in the
//      message's static account keys, which the x402 client put there
//      when it built the tx with our address as the source)
//   4. return tx

import { PublicKey, type VersionedTransaction } from '@solana/web3.js'
import type { WalletAdapter } from 'x402-solana/client'

import * as keystore from '../signer/keystore'

export type KeystoreWalletAdapter = WalletAdapter & {
  publicKey: PublicKey
  address: string
}

export async function createKeystoreWalletAdapter(): Promise<KeystoreWalletAdapter> {
  const key = await keystore.generateOrGetKey()
  const publicKey = new PublicKey(key.address)

  return {
    publicKey,
    address: key.address,
    signTransaction: async (tx: VersionedTransaction) => {
      const messageBytes = tx.message.serialize()
      const sig = await keystore.sign(new Uint8Array(messageBytes))
      tx.addSignature(publicKey, sig)
      return tx
    },
  }
}
