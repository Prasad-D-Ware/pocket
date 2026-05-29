// polyfill.js — runs before any code that touches crypto or Buffer.
//
// 1. react-native-quick-crypto.install() patches global.crypto with a
//    native-backed Web Crypto implementation. @solana/kit, @coral-xyz/
//    anchor, and @solana/web3.js v1 all reach for crypto during load.
//
// 2. Force global.Buffer (and globalThis.Buffer) to the npm 'buffer'
//    package's full-API Buffer. Anchor's borsh deserializer calls
//    legacy Node Buffer methods (readUIntLE, readBigUInt64LE) that
//    some RN Buffer shims omit. Setting it AFTER install() means we
//    win regardless of what rn-quick-crypto planted.
//
// 3. Sanity print at boot. If `readUIntLE` is undefined after our
//    assignment, the wrong Buffer is winning — surface that to logcat
//    instead of silently failing at the first Anchor fetch.

import { install } from 'react-native-quick-crypto'
import { Buffer } from 'buffer'

install()

globalThis.Buffer = Buffer
if (typeof global !== 'undefined') {
  global.Buffer = Buffer
}

if (typeof globalThis.Buffer.prototype.readUIntLE !== 'function') {
  console.warn(
    '[pocket polyfill] global.Buffer is missing readUIntLE — Anchor decoding will fail',
  )
} else {
  console.log('[pocket polyfill] global.Buffer ready (readUIntLE present)')
}
