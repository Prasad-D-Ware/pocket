// src/signer/pocketSigner.ts
//
// Implements @solana/kit's TransactionPartialSigner interface against
// the Android Keystore-backed Ed25519 key from src/signer/keystore.ts.
//
// Day 8 surface: bare signing. Every tx that kit hands to us gets its
// messageBytes piped straight to keystore.sign() and the 64-byte
// result returned in the SignatureDictionary shape Kit expects.
//
// Day 9+ wires PolicyGuard between the message and the keystore call
// — at which point a denied policy throws a typed PolicyDeniedError
// and signing never reaches the secure enclave. For now the signer
// is "always allow" because the upstream policy + on-chain pocket_vault
// already constrain what can happen with the funds.

import {
  address as toAddress,
  type Address,
  type SignatureBytes,
  type TransactionPartialSigner,
} from '@solana/kit'

import * as keystore from './keystore'

export type PocketSigner = TransactionPartialSigner<string> & {
  /** Plain Uint8Array view of the signer's 32-byte public key. */
  publicKey: Uint8Array
}

/**
 * Returns a Kit-compatible signer backed by the device's Pocket
 * Keystore key. First call creates the key in Android Keystore (StrongBox
 * when available, plain Keystore otherwise); subsequent calls reuse it.
 */
export async function createPocketKitSigner(): Promise<PocketSigner> {
  const key = await keystore.generateOrGetKey()
  const addr = toAddress(key.address)

  return {
    address: addr,
    publicKey: key.publicKey,
    signTransactions: async (transactions) => {
      return Promise.all(
        transactions.map(async (tx) => {
          // tx.messageBytes is a ReadonlyUint8Array — the bytes that go
          // into the Ed25519 signature computation. Copy into a fresh
          // Uint8Array so the JNI bridge gets a clean, mutable view.
          const msg = new Uint8Array(tx.messageBytes)
          const sig = (await keystore.sign(msg)) as Uint8Array
          // SignatureBytes is a brand on ReadonlyUint8Array(64). Our
          // keystore returns exactly 64 bytes from Ed25519 — cast.
          return { [addr]: sig as unknown as SignatureBytes } as const
        }),
      )
    },
  }
}
