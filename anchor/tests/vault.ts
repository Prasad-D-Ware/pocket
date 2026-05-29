import * as anchor from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { PocketVault } from '../target/types/pocket_vault'
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js'
import { expect } from 'chai'

describe('pocket_vault — Day 4: open_vault + deposit', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = anchor.workspace.PocketVault as Program<PocketVault>
  const wallet = provider.wallet as anchor.Wallet

  let mint: PublicKey
  let authorityAta: PublicKey
  let vault: PublicKey
  let vaultBump: number
  let vaultAta: PublicKey

  const DECIMALS = 6
  const ONE_TOKEN = new BN(10 ** DECIMALS) // 1.000000 fake-USDC

  before(async () => {
    // Fake USDC mint with the same decimals as real USDC (6). Mint
    // authority is the test wallet so we can mint into the authority's
    // ATA in the test.
    mint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      DECIMALS,
    )

    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey,
    )
    authorityAta = ata.address

    // Mint 100 fake-USDC to the authority so we have plenty to deposit.
    await mintTo(
      provider.connection,
      wallet.payer,
      mint,
      authorityAta,
      wallet.payer,
      100 * 10 ** DECIMALS,
    )
    ;[vault, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), wallet.publicKey.toBuffer()],
      program.programId,
    )
    vaultAta = getAssociatedTokenAddressSync(mint, vault, true)
  })

  it('open_vault initializes the vault PDA + vault ATA', async () => {
    await program.methods
      .openVault()
      .accounts({
        authority: wallet.publicKey,
        mint,
      })
      .rpc()

    const v = await program.account.vault.fetch(vault)
    expect(v.authority.toBase58()).to.eq(wallet.publicKey.toBase58())
    expect(v.mint.toBase58()).to.eq(mint.toBase58())
    expect(v.bump).to.eq(vaultBump)
    expect(v.totalDeposited.toString()).to.eq('0')
    expect(v.totalWithdrawn.toString()).to.eq('0')
    expect(v.policySet).to.eq(false)
  })

  it('deposit transfers tokens into the vault ATA and bumps total_deposited', async () => {
    const depositAmount = ONE_TOKEN.mul(new BN(10)) // 10 fake-USDC

    const sig = await program.methods
      .deposit(depositAmount)
      .accounts({
        authority: wallet.publicKey,
        mint,
      })
      .rpc({ commitment: 'confirmed' })

    console.log('  deposit signature:', sig)

    const v = await program.account.vault.fetch(vault)
    expect(v.totalDeposited.toString()).to.eq(depositAmount.toString())

    const vaultAtaInfo = await provider.connection.getTokenAccountBalance(
      vaultAta,
      'confirmed',
    )
    expect(vaultAtaInfo.value.amount).to.eq(depositAmount.toString())
  })

  it('deposit rejects amount=0 with ZeroAmount', async () => {
    let threw = false
    try {
      await program.methods
        .deposit(new BN(0))
        .accounts({
          authority: wallet.publicKey,
          mint,
        })
        .rpc()
    } catch (e: any) {
      threw = true
      expect(e.error?.errorCode?.code).to.eq('ZeroAmount')
    }
    expect(threw, 'deposit(0) should revert').to.eq(true)
  })
})
