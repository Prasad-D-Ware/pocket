import * as anchor from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { PocketVault } from '../target/types/pocket_vault'
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { PublicKey, Keypair } from '@solana/web3.js'
import { expect } from 'chai'

// Belt for both localnet and devnet to dodge intermittent
// "Blockhash not found" sim failures: fetch a fresh blockhash for
// preflight, retry up to 5 times.
const RPC_OPTS = {
  commitment: 'confirmed' as const,
  preflightCommitment: 'confirmed' as const,
  maxRetries: 5,
}

// Day 4 tests share state with Day 5 by design — they exercise the
// same vault PDA (one per authority). Test order matters:
//   1) open_vault           — vault must not exist yet
//   2) deposit              — vault must exist, policy may or may not
//   3) deposit(0) reject    — pure validation
//   4) Day 5: set_policy    — first call initializes the policy PDA
//   5) Day 5: withdraws     — exercise allow + 4 deny paths

describe('pocket_vault', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const program = anchor.workspace.PocketVault as Program<PocketVault>
  const wallet = provider.wallet as anchor.Wallet

  let mint: PublicKey
  let authorityAta: PublicKey
  let vault: PublicKey
  let vaultBump: number
  let vaultAta: PublicKey
  let policy: PublicKey

  const DECIMALS = 6
  const ONE_TOKEN = new BN(10 ** DECIMALS)

  // ~24h at 400 ms/slot. Real-world value; tests use it for happy path.
  const SLOTS_PER_DAY = new BN(216_000)

  before(async () => {
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
    ;[policy] = PublicKey.findProgramAddressSync(
      [Buffer.from('policy'), vault.toBuffer()],
      program.programId,
    )
  })

  describe('Day 4: open_vault + deposit', () => {
    it('open_vault initializes the vault PDA + vault ATA', async () => {
      await program.methods
        .openVault()
        .accounts({
          authority: wallet.publicKey,
          mint,
        })
        .rpc(RPC_OPTS)

      const v = await program.account.vault.fetch(vault)
      expect(v.authority.toBase58()).to.eq(wallet.publicKey.toBase58())
      expect(v.mint.toBase58()).to.eq(mint.toBase58())
      expect(v.bump).to.eq(vaultBump)
      expect(v.totalDeposited.toString()).to.eq('0')
      expect(v.totalWithdrawn.toString()).to.eq('0')
      expect(v.policySet).to.eq(false)
    })

    it('deposit transfers tokens into the vault ATA and bumps total_deposited', async () => {
      const depositAmount = ONE_TOKEN.mul(new BN(20)) // 20 fake-USDC

      const sig = await program.methods
        .deposit(depositAmount)
        .accounts({
          authority: wallet.publicKey,
          mint,
        })
        .rpc(RPC_OPTS)

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
          .rpc(RPC_OPTS)
      } catch (e: any) {
        threw = true
        expect(e.error?.errorCode?.code).to.eq('ZeroAmount')
      }
      expect(threw, 'deposit(0) should revert').to.eq(true)
    })
  })

  describe('Day 5: set_policy + withdraw_under_policy', () => {
    it('withdraw fails before any policy is set (NoPolicy)', async () => {
      let threw = false
      try {
        await program.methods
          .withdrawUnderPolicy(ONE_TOKEN)
          .accounts({
            authority: wallet.publicKey,
            mint,
            recipientTokenAccount: authorityAta,
          })
          .rpc(RPC_OPTS)
      } catch (e: any) {
        threw = true
        // Could be NoPolicy or AccountNotInitialized depending on PDA presence.
        // Before set_policy, the policy account literally doesn't exist, so
        // Anchor will reject with AccountNotInitialized at deserialization.
        const code = e.error?.errorCode?.code
        expect(['NoPolicy', 'AccountNotInitialized']).to.include(code)
      }
      expect(threw, 'withdraw with no policy should revert').to.eq(true)
    })

    it('set_policy initializes the Policy account and flips vault.policy_set', async () => {
      const maxPerTx = ONE_TOKEN.mul(new BN(5)) // 5 fake-USDC
      const maxPerDay = ONE_TOKEN.mul(new BN(15)) // 15 fake-USDC

      await program.methods
        .setPolicy(
          maxPerTx,
          maxPerDay,
          new BN(0), // 0 = never expires
          SLOTS_PER_DAY,
        )
        .accounts({
          authority: wallet.publicKey,
        })
        .rpc(RPC_OPTS)

      const p = await program.account.policy.fetch(policy)
      expect(p.vault.toBase58()).to.eq(vault.toBase58())
      expect(p.maxPerTxBaseUnits.toString()).to.eq(maxPerTx.toString())
      expect(p.maxPerDayBaseUnits.toString()).to.eq(maxPerDay.toString())
      expect(p.expirySlot.toString()).to.eq('0')
      expect(p.spentInWindow.toString()).to.eq('0')
      expect(p.slotsPerWindow.toString()).to.eq(SLOTS_PER_DAY.toString())

      const v = await program.account.vault.fetch(vault)
      expect(v.policySet).to.eq(true)
    })

    it('withdraw under all caps succeeds and bumps spent_in_window + total_withdrawn', async () => {
      const amount = ONE_TOKEN.mul(new BN(3)) // 3 fake-USDC ≤ 5 per-tx ≤ 15 daily

      const vBefore = await program.account.vault.fetch(vault)
      const pBefore = await program.account.policy.fetch(policy)
      const ataBefore = await provider.connection.getTokenAccountBalance(
        authorityAta,
        'confirmed',
      )

      const sig = await program.methods
        .withdrawUnderPolicy(amount)
        .accounts({
          authority: wallet.publicKey,
          mint,
          recipientTokenAccount: authorityAta,
        })
        .rpc(RPC_OPTS)

      console.log('  withdraw signature:', sig)

      const vAfter = await program.account.vault.fetch(vault)
      const pAfter = await program.account.policy.fetch(policy)
      const ataAfter = await provider.connection.getTokenAccountBalance(
        authorityAta,
        'confirmed',
      )

      expect(
        new BN(vAfter.totalWithdrawn).sub(new BN(vBefore.totalWithdrawn)).toString(),
      ).to.eq(amount.toString())
      expect(
        new BN(pAfter.spentInWindow).sub(new BN(pBefore.spentInWindow)).toString(),
      ).to.eq(amount.toString())
      expect(
        new BN(ataAfter.value.amount).sub(new BN(ataBefore.value.amount)).toString(),
      ).to.eq(amount.toString())
    })

    it('withdraw amount > max_per_tx fails with AmountExceeded', async () => {
      // current per-tx limit is 5 fake-USDC, ask for 6
      const tooBig = ONE_TOKEN.mul(new BN(6))

      let threw = false
      try {
        await program.methods
          .withdrawUnderPolicy(tooBig)
          .accounts({
            authority: wallet.publicKey,
            mint,
            recipientTokenAccount: authorityAta,
          })
          .rpc(RPC_OPTS)
      } catch (e: any) {
        threw = true
        expect(e.error?.errorCode?.code).to.eq('AmountExceeded')
      }
      expect(threw, 'withdraw > max_per_tx should revert').to.eq(true)
    })

    it('withdraw that would push daily total over cap fails with DailyCapExceeded', async () => {
      // Resetting policy zeroes spent_in_window, so we set caps where a
      // single withdraw passes the per-tx check but a second equal one
      // breaches the daily cap. With max_per_tx=max_per_day=5:
      //   1st withdraw 3 → spent=3 ≤ 5 daily ✔
      //   2nd withdraw 3 → 6 > 5 daily ✘ DailyCapExceeded
      const maxPerTx = ONE_TOKEN.mul(new BN(5))
      const maxPerDay = ONE_TOKEN.mul(new BN(5))

      await program.methods
        .setPolicy(maxPerTx, maxPerDay, new BN(0), SLOTS_PER_DAY)
        .accounts({ authority: wallet.publicKey })
        .rpc(RPC_OPTS)

      await program.methods
        .withdrawUnderPolicy(ONE_TOKEN.mul(new BN(3)))
        .accounts({
          authority: wallet.publicKey,
          mint,
          recipientTokenAccount: authorityAta,
        })
        .rpc(RPC_OPTS)

      let threw = false
      try {
        await program.methods
          .withdrawUnderPolicy(ONE_TOKEN.mul(new BN(3)))
          .accounts({
            authority: wallet.publicKey,
            mint,
            recipientTokenAccount: authorityAta,
          })
          .rpc(RPC_OPTS)
      } catch (e: any) {
        threw = true
        expect(e.error?.errorCode?.code).to.eq('DailyCapExceeded')
      }
      expect(threw, 'withdraw past daily cap should revert').to.eq(true)
    })

    it('withdraw under an already-expired policy fails with PolicyExpired', async () => {
      // Set expiry to slot 1 — way in the past.
      const maxPerTx = ONE_TOKEN.mul(new BN(5))
      const maxPerDay = ONE_TOKEN.mul(new BN(15))

      await program.methods
        .setPolicy(maxPerTx, maxPerDay, new BN(1), SLOTS_PER_DAY)
        .accounts({ authority: wallet.publicKey })
        .rpc(RPC_OPTS)

      let threw = false
      try {
        await program.methods
          .withdrawUnderPolicy(ONE_TOKEN)
          .accounts({
            authority: wallet.publicKey,
            mint,
            recipientTokenAccount: authorityAta,
          })
          .rpc(RPC_OPTS)
      } catch (e: any) {
        threw = true
        expect(e.error?.errorCode?.code).to.eq('PolicyExpired')
      }
      expect(threw, 'withdraw after expiry should revert').to.eq(true)
    })

    it('set_policy rejects max_per_day < max_per_tx with InvalidPolicyLimits', async () => {
      let threw = false
      try {
        await program.methods
          .setPolicy(
            ONE_TOKEN.mul(new BN(10)),
            ONE_TOKEN, // 1 < 10
            new BN(0),
            SLOTS_PER_DAY,
          )
          .accounts({ authority: wallet.publicKey })
          .rpc(RPC_OPTS)
      } catch (e: any) {
        threw = true
        expect(e.error?.errorCode?.code).to.eq('InvalidPolicyLimits')
      }
      expect(threw, 'inverted limits should revert').to.eq(true)
    })
  })
})
