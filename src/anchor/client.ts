// Thin Anchor client over the on-chain pocket_vault program. Day 6
// surface is read-only: PDA derivations + fetchVault + fetchPolicy.
// Writes (set_policy, deposit, withdraw_under_policy) arrive on Day 8
// once the device-bound signer (src/signer/) lands — until then there
// is no key on the device to sign with.
//
// On RN this depends on the polyfill chain in polyfill.js (Buffer +
// react-native-quick-crypto). Importing this file from a non-polyfilled
// environment will explode at PublicKey construction time.

import {
  AnchorProvider,
  Program,
  Wallet,
  type IdlAccounts,
} from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

import idl from './idl/pocket_vault.json'
import type { PocketVault } from './types/pocket_vault'
import { DEVNET_RPC, POCKET_VAULT_PROGRAM_ID } from './constants'

export type VaultAccount = IdlAccounts<PocketVault>['vault']
export type PolicyAccount = IdlAccounts<PocketVault>['policy']

/**
 * AnchorProvider requires a Wallet implementation even for read-only
 * usage (it's a constructor argument). This stub throws on any sign
 * call, so attempting to send a tx with the read-only client surfaces
 * loudly rather than silently no-op'ing.
 */
class ReadOnlyWallet implements Wallet {
  publicKey = PublicKey.default

  async signTransaction<T extends Transaction | VersionedTransaction>(
    _tx: T,
  ): Promise<T> {
    throw new Error('Pocket client is read-only on Day 6 — no signer wired yet')
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    _txs: T[],
  ): Promise<T[]> {
    throw new Error('Pocket client is read-only on Day 6 — no signer wired yet')
  }

  get payer(): Keypair {
    throw new Error('Pocket client is read-only on Day 6 — no signer wired yet')
  }
}

export type PocketClient = {
  program: Program<PocketVault>
  connection: Connection
  programId: PublicKey
}

export function createReadOnlyClient(
  rpcUrl: string = DEVNET_RPC,
): PocketClient {
  const connection = new Connection(rpcUrl, 'confirmed')
  const provider = new AnchorProvider(connection, new ReadOnlyWallet(), {
    commitment: 'confirmed',
  })
  // Anchor 0.32 reads programId from idl.address — generated IDL is
  // already synced to jt6kDwFr...pXu.
  const program = new Program<PocketVault>(idl as PocketVault, provider)
  return {
    program,
    connection,
    programId: new PublicKey(POCKET_VAULT_PROGRAM_ID),
  }
}

export function deriveVaultPda(
  authority: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.toBuffer()],
    new PublicKey(POCKET_VAULT_PROGRAM_ID),
  )
}

export function derivePolicyPda(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('policy'), vault.toBuffer()],
    new PublicKey(POCKET_VAULT_PROGRAM_ID),
  )
}

/**
 * Returns null if the vault account does not exist. Any other error
 * propagates — the caller should surface it (devnet RPC down, etc.).
 */
export async function fetchVault(
  client: PocketClient,
  authority: PublicKey,
): Promise<{ vault: PublicKey; data: VaultAccount } | null> {
  const [vault] = deriveVaultPda(authority)
  try {
    const data = await client.program.account.vault.fetch(vault)
    return { vault, data: data as VaultAccount }
  } catch (e) {
    if (isAccountNotFound(e)) return null
    throw e
  }
}

export async function fetchPolicy(
  client: PocketClient,
  vault: PublicKey,
): Promise<{ policy: PublicKey; data: PolicyAccount } | null> {
  const [policy] = derivePolicyPda(vault)
  try {
    const data = await client.program.account.policy.fetch(policy)
    return { policy, data: data as PolicyAccount }
  } catch (e) {
    if (isAccountNotFound(e)) return null
    throw e
  }
}

export async function fetchVaultAtaBalance(
  client: PocketClient,
  vault: PublicKey,
  mint: PublicKey,
): Promise<{ ata: PublicKey; raw: string; uiAmount: number | null } | null> {
  // Vault ATA is an off-curve ATA owned by the vault PDA.
  const ata = getAssociatedTokenAddressSync(mint, vault, true)
  try {
    const bal = await client.connection.getTokenAccountBalance(
      ata,
      'confirmed',
    )
    return {
      ata,
      raw: bal.value.amount,
      uiAmount: bal.value.uiAmount,
    }
  } catch (e) {
    if (isAccountNotFound(e)) return null
    return null
  }
}

function isAccountNotFound(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e)
  return (
    m.includes('Account does not exist') ||
    m.includes('could not find account') ||
    m.includes('Invalid param')
  )
}
