// src/signer/keystore.ts — pocket-keystore wrapper with Solana niceties.
//
// All Pocket signing flows through this module. The private key never
// touches JS; we only get the 32-byte public key (Solana address) and
// the 64-byte signature back from the native side.

import bs58 from 'bs58'
import PocketKeystore from '../../modules/pocket-keystore'

// Versioned so future migrations (e.g. moving to StrongBox-required,
// or rotating after a security event) can introduce a new alias
// without clobbering the old one.
export const POCKET_SIGNER_ALIAS = 'pocket.signer.v1'

export type PocketKey = {
  alias: string
  publicKey: Uint8Array // 32 raw bytes
  address: string // base58-encoded Solana address
}

export function isAvailable(): boolean {
  return PocketKeystore.isAvailable()
}

export function hasKey(alias: string = POCKET_SIGNER_ALIAS): boolean {
  return PocketKeystore.hasKey(alias)
}

export async function generateOrGetKey(
  alias: string = POCKET_SIGNER_ALIAS,
): Promise<PocketKey> {
  const publicKey = PocketKeystore.hasKey(alias)
    ? PocketKeystore.getPublicKey(alias)
    : await PocketKeystore.generateKey(alias)
  return {
    alias,
    publicKey: toUint8Array(publicKey),
    address: bs58.encode(toUint8Array(publicKey)),
  }
}

export async function sign(
  message: Uint8Array,
  alias: string = POCKET_SIGNER_ALIAS,
): Promise<Uint8Array> {
  const sig = await PocketKeystore.sign(alias, message)
  return toUint8Array(sig)
}

export function deleteKey(alias: string = POCKET_SIGNER_ALIAS): void {
  PocketKeystore.deleteKey(alias)
}

// Expo Modules coerces Kotlin ByteArray ↔ JS Uint8Array, but the
// concrete view we get back can be either a Uint8Array or an
// ArrayBufferView depending on the bridge version. Normalize to a
// real Uint8Array so callers (tweetnacl, bs58) get what they expect.
function toUint8Array(b: Uint8Array | ArrayBufferLike | number[]): Uint8Array {
  if (b instanceof Uint8Array) return b
  if (ArrayBuffer.isView(b)) {
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  }
  return new Uint8Array(b as ArrayBufferLike)
}
