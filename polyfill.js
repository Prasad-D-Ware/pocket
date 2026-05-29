// polyfill.js — run before any code that touches crypto or Buffer.
// @solana/kit + @coral-xyz/anchor + @solana/web3.js (v1, pulled in by
// Anchor) all assume a Node-style crypto API and a global Buffer.
import { install } from 'react-native-quick-crypto'
import { Buffer } from 'buffer'

install()

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer
}
