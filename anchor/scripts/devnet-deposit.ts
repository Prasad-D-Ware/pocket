import * as anchor from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { PocketVault } from '../target/types/pocket_vault'
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'

// Standalone Day 4 devnet deposit. The original test suite hit a
// "Blockhash not found" flake between simulation and submission. The
// vault was opened, but deposit didn't land. This script reads the
// existing vault, mints a few more tokens to the authority's ATA, and
// runs a deposit — capturing the signature for Solscan.

async function main() {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = anchor.workspace.PocketVault as Program<PocketVault>
  const wallet = provider.wallet as anchor.Wallet

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), wallet.publicKey.toBuffer()],
    program.programId,
  )

  const v = await program.account.vault.fetch(vault)
  const mint: PublicKey = v.mint
  console.log('vault:', vault.toBase58())
  console.log('mint :', mint.toBase58())
  console.log('total_deposited (pre):', v.totalDeposited.toString())

  // Make sure the authority has an ATA and some of the vault's mint.
  // The mint authority for this mint is the wallet (set during the
  // earlier test's before() hook).
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mint,
    wallet.publicKey,
  )

  await mintTo(
    provider.connection,
    wallet.payer,
    mint,
    ata.address,
    wallet.payer,
    20_000_000, // 20 fake-USDC (6 decimals)
  )

  // Deposit 10 fake-USDC. Use processed commitment for the simulation
  // and explicit confirmed commitment for the receipt to avoid the
  // blockhash flake we saw under anchor test.
  const amount = new BN(10_000_000)
  const sig = await program.methods
    .deposit(amount)
    .accounts({
      authority: wallet.publicKey,
      mint,
    })
    .rpc({
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
      skipPreflight: false,
      maxRetries: 5,
    })

  console.log('\n--- deposit success ---')
  console.log('signature  :', sig)
  console.log('explorer   : https://explorer.solana.com/tx/' + sig + '?cluster=devnet')
  console.log('solscan    : https://solscan.io/tx/' + sig + '?cluster=devnet')

  const v2 = await program.account.vault.fetch(vault)
  console.log('total_deposited (post):', v2.totalDeposited.toString())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
