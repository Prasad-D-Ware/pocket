const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// Solana RN ecosystem compatibility. @solana/web3.js (v1, pulled in by
// @coral-xyz/anchor) reaches into:
//   - @noble/hashes/crypto.js — sub-path not in the package's exports map
//   - rpc-websockets — exports map has no react-native / android condition
// Disabling the new package-exports resolver makes Metro fall back to the
// older main / file-based resolution, which is what these calls already
// resolve through. This silences the warnings without changing behavior.
config.resolver.unstable_enablePackageExports = false

// Some web3.js v1 paths reference node:stream / node:events — point them
// at empty shims if they show up. Most of these never execute on the
// RN side; they're dead branches kept by the bundler.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('react-native-quick-crypto'),
  buffer: require.resolve('buffer'),
}

const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
})

module.exports = uniwindConfig
