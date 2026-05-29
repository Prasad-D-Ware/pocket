import * as anchor from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { PocketVault } from '../target/types/pocket_vault'
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'

// Day 5 devnet smoke test against the existing pocket_vault on devnet.
// Reads the vault opened on Day 4, installs a permissive policy via
// set_policy, then withdraws 1 fake-USDC back to the authority's ATA
// via withdraw_under_policy. Captures both signatures for grant
// evidence on Solscan.

const RPC_OPTS = {
  commitment: 'confirmed' as const,
  preflightCommitment: 'confirmed' as const,
  maxRetries: 5,
}

async function main() {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = anchor.workspace.PocketVault as Program<PocketVault>
  const wallet = provider.wallet as anchor.Wallet

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), wallet.publicKey.toBuffer()],
    program.programId,
  )
  const [policy] = PublicKey.findProgramAddressSync(
    [Buffer.from('policy'), vault.toBuffer()],
    program.programId,
  )

  const v = await program.account.vault.fetch(vault)
  const mint = v.mint
  const vaultAta = getAssociatedTokenAddressSync(mint, vault, true)
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mint,
    wallet.publicKey,
  )

  console.log('program        :', program.programId.toBase58())
  console.log('vault          :', vault.toBase58())
  console.log('policy         :', policy.toBase58())
  console.log('mint           :', mint.toBase58())
  console.log('vault ATA      :', vaultAta.toBase58())
  console.log('total_deposited:', v.totalDeposited.toString())
  console.log('total_withdrawn:', v.totalWithdrawn.toString())
  console.log('policy_set     :', v.policySet)

  // 1) set_policy — 5 fake-USDC per tx, 15 per day, no expiry, 24h window
  const maxPerTx = new BN(5_000_000)
  const maxPerDay = new BN(15_000_000)
  const slotsPerDay = new BN(216_000)

  const setSig = await program.methods
    .setPolicy(maxPerTx, maxPerDay, new BN(0), slotsPerDay)
    .accounts({ authority: wallet.publicKey })
    .rpc(RPC_OPTS)
  console.log('\n--- set_policy success ---')
  console.log('signature :', setSig)
  console.log('explorer  : https://explorer.solana.com/tx/' + setSig + '?cluster=devnet')

  const p = await program.account.policy.fetch(policy)
  console.log('policy.max_per_tx :', p.maxPerTxBaseUnits.toString())
  console.log('policy.max_per_day:', p.maxPerDayBaseUnits.toString())
  console.log('policy.expiry_slot:', p.expirySlot.toString())

  // 2) withdraw_under_policy — 1 fake-USDC
  const withdrawAmount = new BN(1_000_000)
  const wSig = await program.methods
    .withdrawUnderPolicy(withdrawAmount)
    .accounts({
      authority: wallet.publicKey,
      mint,
      recipientTokenAccount: recipientAta.address,
    })
    .rpc(RPC_OPTS)
  console.log('\n--- withdraw_under_policy success ---')
  console.log('signature :', wSig)
  console.log('explorer  : https://explorer.solana.com/tx/' + wSig + '?cluster=devnet')

  const v2 = await program.account.vault.fetch(vault)
  const p2 = await program.account.policy.fetch(policy)
  console.log('\nvault.total_withdrawn:', v2.totalWithdrawn.toString())
  console.log('policy.spent_in_window:', p2.spentInWindow.toString())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
