// Pocket Keystore — Expo local module bridge.
//
// All keys live in Android Keystore (StrongBox-backed when the device
// supports it, software-backed Keystore otherwise). The private key
// never leaves the secure store — we only get the public key + the
// output of Signature.sign() over a message we pass in.
//
// Requires Android API 33+ for Ed25519 (added in Android 13). On
// older Android or any iOS device, isAvailable() returns false and
// the other calls throw.

import { requireNativeModule } from 'expo'

type NativeApi = {
  isAvailable(): boolean
  hasKey(alias: string): boolean
  generateKey(alias: string): Promise<Uint8Array> // returns the 32-byte public key
  getPublicKey(alias: string): Uint8Array
  sign(alias: string, message: Uint8Array): Promise<Uint8Array> // 64-byte signature
  deleteKey(alias: string): void
}

const native = requireNativeModule('PocketKeystore') as NativeApi

export default native
