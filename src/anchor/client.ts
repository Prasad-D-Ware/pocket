// Thin Anchor client over the on-chain pocket_vault program.
//
// Day 6  — read-only client (createReadOnlyClient + fetch helpers).
// Day 13 — writable client (createWritableClient + openVault +
//          setPolicy), backed by an Anchor Wallet adapter that wraps
//          Pocket Keystore (see src/anchor/anchorWalletAdapter.ts).
//
// On RN this depends on the polyfill chain in polyfill.js (Buffer +
// react-native-quick-crypto). Importing this file from a non-polyfilled
// environment will explode at PublicKey construction time.

import {
  AnchorProvider,
  BN,
  Program,
  type IdlAccounts,
} from '@coral-xyz/anchor'
import type { AnchorWalletInterface } from './anchorWalletAdapter'
import {
  Connection,
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
class ReadOnlyWallet implements AnchorWalletInterface {
  publicKey = PublicKey.default

  async signTransaction<T extends Transaction | VersionedTransaction>(
    _tx: T,
  ): Promise<T> {
    throw new Error('Pocket client is read-only — use createWritableClient for writes')
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    _txs: T[],
  ): Promise<T[]> {
    throw new Error('Pocket client is read-only — use createWritableClient for writes')
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
  const provider = new AnchorProvider(
    connection,
    new ReadOnlyWallet() as unknown as ConstructorParameters<
      typeof AnchorProvider
    >[1],
    { commitment: 'confirmed' },
  )
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
 *
 * RN quirk: @coral-xyz/anchor@0.32 depends on the legacy `buffer-layout`
 * package, which calls `b.readUIntLE` directly without wrapping
 * Uint8Array → Buffer first. If anything in the connection/coder path
 * returns plain Uint8Array (Metro can serve a different `buffer`
 * instance through transitive deps than the one our polyfill installs
 * on `globalThis`), the decode blows up with
 *   "b.readUIntLE is not a function (it is undefined)".
 *
 * We dodge this by fetching the raw account ourselves, re-wrapping the
 * data with `Buffer.from(...)` to guarantee a full-API Buffer, then
 * driving the coder directly. `Buffer.from(uint8array)` returns a
 * Buffer view sharing the same underlying ArrayBuffer — no copy.
 */
export async function fetchVault(
  client: PocketClient,
  authority: PublicKey,
): Promise<{ vault: PublicKey; data: VaultAccount } | null> {
  const [vault] = deriveVaultPda(authority)
  try {
    const accountInfo = await client.connection.getAccountInfo(
      vault,
      'confirmed',
    )
    if (!accountInfo) return null
    const buf = Buffer.from(accountInfo.data)
    const data = client.program.coder.accounts.decode<VaultAccount>(
      'vault',
      buf,
    )
    return { vault, data }
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
    const accountInfo = await client.connection.getAccountInfo(
      policy,
      'confirmed',
    )
    if (!accountInfo) return null
    const buf = Buffer.from(accountInfo.data)
    const data = client.program.coder.accounts.decode<PolicyAccount>(
      'policy',
      buf,
    )
    return { policy, data }
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

// ===== Day 13 — writable client + write ops =====
//
// All write paths route through the supplied Anchor Wallet, which on
// RN is the Keystore-backed adapter (anchorWalletAdapter.ts). Same
// preflight + retry belt we use everywhere on devnet to dodge
// "Blockhash not found" flakes.

const ANCHOR_RPC_OPTS = {
  commitment: 'confirmed' as const,
  preflightCommitment: 'confirmed' as const,
  maxRetries: 5,
  skipPreflight: false,
}

export function createWritableClient(
  wallet: AnchorWalletInterface,
  rpcUrl: string = DEVNET_RPC,
): PocketClient {
  const connection = new Connection(rpcUrl, 'confirmed')
  // AnchorProvider's runtime type for `wallet` is the structural
  // interface in provider.d.ts (payer is optional). Cast through
  // unknown to bypass the public-export type which is NodeWallet.
  const provider = new AnchorProvider(
    connection,
    wallet as unknown as ConstructorParameters<typeof AnchorProvider>[1],
    ANCHOR_RPC_OPTS,
  )
  const program = new Program<PocketVault>(idl as PocketVault, provider)
  return {
    program,
    connection,
    programId: new PublicKey(POCKET_VAULT_PROGRAM_ID),
  }
}

/**
 * Opens a fresh vault PDA + vault ATA for the given authority/mint.
 * Throws if the vault already exists. Returns the tx signature.
 */
export async function openVault(
  client: PocketClient,
  authority: PublicKey,
  mint: PublicKey,
): Promise<string> {
  return client.program.methods
    .openVault()
    .accounts({ authority, mint })
    .rpc(ANCHOR_RPC_OPTS)
}

/**
 * Installs or updates the on-chain Policy for this vault. Anchor's
 * init_if_needed makes the same call work for both first-time create
 * and subsequent updates; the program resets daily_window_start_slot
 * + spent_in_window on every call, so updating gives the user a
 * fresh budget (intentional — see programs/pocket_vault/src/lib.rs).
 */
export async function setPolicy(
  client: PocketClient,
  authority: PublicKey,
  args: {
    maxPerTxBaseUnits: BN
    maxPerDayBaseUnits: BN
    /** 0 = never expires. */
    expirySlot: BN
    /** ~216,000 = 24h at 400 ms/slot. */
    slotsPerWindow: BN
  },
): Promise<string> {
  return client.program.methods
    .setPolicy(
      args.maxPerTxBaseUnits,
      args.maxPerDayBaseUnits,
      args.expirySlot,
      args.slotsPerWindow,
    )
    .accounts({ authority })
    .rpc(ANCHOR_RPC_OPTS)
}
