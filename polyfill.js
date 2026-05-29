// polyfill.js — runs before any code that touches crypto or Buffer.
//
// Two polyfills, in order:
//
// 1. react-native-quick-crypto.install() patches global.crypto with a
//    native-backed Web Crypto implementation. @solana/kit and
//    @coral-xyz/anchor both reach for crypto.subtle / randomBytes
//    during module load.
//
// 2. Force global.Buffer to the npm `buffer` package's Buffer.
//    Anchor's borsh deserializer calls legacy Node Buffer methods
//    (readUIntLE, readBigUInt64LE, etc.) that some RN Buffer shims
//    omit. The npm `buffer` package implements the full Node Buffer
//    API. We set it AFTER install() so it wins regardless of what
//    rn-quick-crypto planted on global.Buffer.

import { install } from 'react-native-quick-crypto'
import { Buffer } from 'buffer'

install()

global.Buffer = Buffer
