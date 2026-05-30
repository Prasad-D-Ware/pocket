// src/anchor/anchorWalletAdapter.ts
//
// Wallet adapter (Anchor's interface) backed by Pocket Keystore.
// Parallel to src/x402/keystoreWalletAdapter.ts — different consumer
// (Anchor) wants a slightly different shape (signAllTransactions too,
// no payTo concept).
//
// Anchor 0.32+'s Wallet only needs publicKey + signTransaction +
// signAllTransactions; payer was dropped. We don't expose one — there
// is no exportable Keypair, that's the entire point of hardware-bound
// signing.

import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js'

import * as keystore from '../signer/keystore'

// Matches @coral-xyz/anchor's `Wallet` *interface* in provider.d.ts
// (where payer is optional). The package's top-level `Wallet` EXPORT
// is the NodeWallet class which requires payer: Keypair — wrong for
// our hardware-bound use case. Replicating the interface keeps us
// off the deep import path.
export type AnchorWalletInterface = {
  publicKey: PublicKey
  signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T,
  ): Promise<T>
  signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]>
}

export type AnchorWalletAdapter = AnchorWalletInterface & { address: string }

export async function createAnchorWalletAdapter(): Promise<AnchorWalletAdapter> {
  const key = await keystore.generateOrGetKey()
  const publicKey = new PublicKey(key.address)

  async function signOne<T extends Transaction | VersionedTransaction>(
    tx: T,
  ): Promise<T> {
    if (isVersioned(tx)) {
      const sig = await keystore.sign(new Uint8Array(tx.message.serialize()))
      tx.addSignature(publicKey, sig)
      return tx as T
    }
    const legacy = tx as Transaction
    const msg = legacy.serializeMessage()
    const sig = await keystore.sign(new Uint8Array(msg))
    legacy.addSignature(publicKey, Buffer.from(sig))
    return tx
  }

  return {
    publicKey,
    address: key.address,
    signTransaction: signOne,
    signAllTransactions: async (txs) => {
      // Sequential — keystore.sign on Keystore can serialize signing
      // ops at the OS layer, parallel adds nothing and complicates
      // failure handling.
      const out: typeof txs = [] as typeof txs
      for (const tx of txs) {
        out.push(await signOne(tx))
      }
      return out
    },
  }
}

function isVersioned(
  tx: Transaction | VersionedTransaction,
): tx is VersionedTransaction {
  // VersionedTransaction has a `version` field; Transaction doesn't.
  return 'version' in tx
}
