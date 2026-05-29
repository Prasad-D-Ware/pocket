const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Solana RN ecosystem package-exports tuning.
//
// @solana/web3.js (v1, pulled in by @coral-xyz/anchor) ships deep
// imports into a couple of packages whose package.json exports maps
// don't match RN by default:
//
//   - rpc-websockets — exports has node/browser conditions but no
//     react-native one. Adding 'react-native' + 'browser' to the
//     condition names makes Metro pick the browser entry.
//   - @noble/hashes/crypto.js — sub-path not in the package's
//     exports map at all. Metro's fall-back file-based resolution
//     still finds the file at runtime, so it works; the warning is
//     cosmetic and we leave it alone (the alternative — disabling
//     package exports entirely — breaks react-native itself, which
//     relies on its exports map for platform-specific entry points).
config.resolver.unstable_conditionNames = [
  'require',
  'react-native',
  'browser',
  'default',
]

const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
})

module.exports = uniwindConfig
