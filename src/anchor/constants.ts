// Static config for the on-chain pocket_vault program. These values
// are stable across Day 6 → device-bound signing on Day 8+.

export const POCKET_VAULT_PROGRAM_ID =
  'jt6kDwFrRiZdgGZiDdD3o5jLq9NfNN8MWyC1BXC1pXu'

export const DEVNET_RPC = 'https://api.devnet.solana.com'

// Day 6 only. Hardcoded to the wallet that deployed + tested the
// program (the one that holds vault FJwh5bM7...nL2MP on devnet).
// Day 8 replaces this with the Android Keystore-derived authority.
export const DAY_6_TEST_AUTHORITY =
  '7RKbeEC9ao4hu4BgDsiXXhNFP8JN4GrMBPXBZ7c29nbV'
