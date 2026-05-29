// polyfill.js — runs before any code that touches crypto or Buffer.
//
// 1. react-native-quick-crypto.install() patches global.crypto with a
//    native-backed Web Crypto implementation. @solana/kit + @coral-xyz/
//    anchor + @solana/web3.js v1 all reach for crypto during module
//    load.
//
// 2. Force globalThis.Buffer to the npm `buffer` package's Buffer.
//    Anchor / borsh / buffer-layout assume the full Node Buffer API.
//
// 3. Patch Buffer.prototype.subarray to keep the Buffer prototype.
//    The npm `buffer` package's slice() does this fix-up, but
//    subarray() does not — it falls through to Uint8Array's, which
//    returns a Uint8Array (no readUIntLE et al). In Node, native
//    Buffer overrides subarray; in RN/Hermes there is no native
//    Buffer, so the polyfill's hole is exposed.
//
//    Anchor 0.32 hits this path here:
//      @coral-xyz/anchor/dist/cjs/coder/borsh/accounts.js
//        const data = acc.subarray(discriminator.length);
//        return layout.layout.decode(data);
//    where the layout decoder calls data.readUIntLE(...) and crashes
//    with "b.readUIntLE is not a function".

import { install } from 'react-native-quick-crypto'
import { Buffer } from 'buffer'

install()

globalThis.Buffer = Buffer
if (typeof global !== 'undefined') {
  global.Buffer = Buffer
}

const origSubarray = Buffer.prototype.subarray
Buffer.prototype.subarray = function subarray(start, end) {
  const newBuf = origSubarray.call(this, start, end)
  Object.setPrototypeOf(newBuf, Buffer.prototype)
  return newBuf
}

if (
  typeof Buffer.from([1, 2, 3]).subarray(1).readUIntLE !== 'function' ||
  typeof Buffer.prototype.readUIntLE !== 'function'
) {
  console.warn(
    '[pocket polyfill] Buffer subarray patch failed — Anchor decoding will crash',
  )
} else {
  console.log(
    '[pocket polyfill] Buffer ready (readUIntLE on instances + subarray patched)',
  )
}
