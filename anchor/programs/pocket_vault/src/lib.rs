// pocket_vault — Pocket's onchain policy-enforced sub-account vault.
//
// Day 4 surface: open_vault + deposit.
// Day 5 surface (added below): set_policy + withdraw_under_policy.
//
// Defense in depth. The off-chain PolicyGuard (src/policy/) has a rich
// policy with program/mint/host allowlists, x402 host rules, etc. The
// on-chain Policy here is a smaller, monetary-only subset: per-tx cap,
// rolling daily cap, and an expiry slot. Even a compromised wallet key
// cannot bypass these — the vault ATA is owned by the program PDA, and
// the program won't sign a TransferChecked CPI unless every check
// passes.
//
// v1 targets classic SPL Token only (devnet USDC). Token-2022 deferred
// to v2.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked},
};

declare_id!("jt6kDwFrRiZdgGZiDdD3o5jLq9NfNN8MWyC1BXC1pXu");

#[program]
pub mod pocket_vault {
    use super::*;

    pub fn open_vault(ctx: Context<OpenVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.mint = ctx.accounts.mint.key();
        vault.bump = ctx.bumps.vault;
        vault.opened_at_slot = Clock::get()?.slot;
        vault.total_deposited = 0;
        vault.total_withdrawn = 0;
        vault.policy_set = false;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require_gt!(amount, 0, VaultError::ZeroAmount);

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.authority_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = vault
            .total_deposited
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        Ok(())
    }

    // Day 5: install or update the on-chain policy for this vault.
    // init_if_needed so the authority can update limits at any time
    // (e.g. raise the daily cap, push expiry out). Updating resets the
    // current daily window's spent counter to 0 and re-seeds the
    // window start to the current slot — intentional, since changing
    // limits should give the user a fresh budget rather than
    // half-overlapping the previous one.
    pub fn set_policy(
        ctx: Context<SetPolicy>,
        max_per_tx_base_units: u64,
        max_per_day_base_units: u64,
        expiry_slot: u64,
        slots_per_window: u64,
    ) -> Result<()> {
        require!(
            max_per_day_base_units >= max_per_tx_base_units,
            VaultError::InvalidPolicyLimits
        );
        require_gt!(slots_per_window, 0, VaultError::InvalidPolicyLimits);

        let current_slot = Clock::get()?.slot;
        let policy = &mut ctx.accounts.policy;
        policy.vault = ctx.accounts.vault.key();
        policy.max_per_tx_base_units = max_per_tx_base_units;
        policy.max_per_day_base_units = max_per_day_base_units;
        policy.expiry_slot = expiry_slot; // 0 = never expires
        policy.slots_per_window = slots_per_window;
        policy.daily_window_start_slot = current_slot;
        policy.spent_in_window = 0;
        policy.bump = ctx.bumps.policy;

        ctx.accounts.vault.policy_set = true;
        Ok(())
    }

    // Day 5: withdraw `amount` from the vault to `recipient_token_account`,
    // gated by the on-chain Policy. The vault PDA signs the CPI, so the
    // recipient does not need to be related to the authority — this is the
    // path agents use to pay arbitrary endpoints under policy.
    pub fn withdraw_under_policy(
        ctx: Context<WithdrawUnderPolicy>,
        amount: u64,
    ) -> Result<()> {
        require_gt!(amount, 0, VaultError::ZeroAmount);
        require!(ctx.accounts.vault.policy_set, VaultError::NoPolicy);

        let current_slot = Clock::get()?.slot;
        let policy = &mut ctx.accounts.policy;

        // Expiry — expiry_slot of 0 is the "never expires" sentinel.
        if policy.expiry_slot != 0 {
            require!(
                current_slot <= policy.expiry_slot,
                VaultError::PolicyExpired
            );
        }

        // Per-tx cap.
        require!(
            amount <= policy.max_per_tx_base_units,
            VaultError::AmountExceeded
        );

        // Sliding daily window: if we've crossed past the window's end,
        // start a fresh window from this slot. saturating_add so a
        // bogus far-future window_start doesn't underflow into "always
        // rolled over".
        let window_end = policy
            .daily_window_start_slot
            .saturating_add(policy.slots_per_window);
        if current_slot >= window_end {
            policy.daily_window_start_slot = current_slot;
            policy.spent_in_window = 0;
        }

        // Daily cap.
        let projected = policy
            .spent_in_window
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        require!(
            projected <= policy.max_per_day_base_units,
            VaultError::DailyCapExceeded
        );

        // CPI TransferChecked signed by the vault PDA.
        let authority_key = ctx.accounts.authority.key();
        let vault_bump = ctx.accounts.vault.bump;
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"vault", authority_key.as_ref(), &[vault_bump]]];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;

        // Bump counters after the CPI succeeds.
        policy.spent_in_window = projected;
        let vault = &mut ctx.accounts.vault;
        vault.total_withdrawn = vault
            .total_withdrawn
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct OpenVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Vault::SPACE,
        seeds = [b"vault", authority.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = mint,
    )]
    pub vault: Account<'info, Vault>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = authority,
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        payer = authority,
        space = Policy::SPACE,
        seeds = [b"policy", vault.key().as_ref()],
        bump,
    )]
    pub policy: Account<'info, Policy>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawUnderPolicy<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = mint,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"policy", vault.key().as_ref()],
        bump = policy.bump,
        has_one = vault,
    )]
    pub policy: Account<'info, Policy>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
    pub opened_at_slot: u64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub policy_set: bool,
}

impl Vault {
    pub const SPACE: usize = 8  // anchor discriminator
        + 32                    // authority
        + 32                    // mint
        + 1                     // bump
        + 8                     // opened_at_slot
        + 8                     // total_deposited
        + 8                     // total_withdrawn
        + 1;                    // policy_set
}

#[account]
pub struct Policy {
    pub vault: Pubkey,
    pub max_per_tx_base_units: u64,
    pub max_per_day_base_units: u64,
    pub expiry_slot: u64,
    pub daily_window_start_slot: u64,
    pub spent_in_window: u64,
    pub slots_per_window: u64,
    pub bump: u8,
}

impl Policy {
    pub const SPACE: usize = 8  // anchor discriminator
        + 32                    // vault
        + 8                     // max_per_tx_base_units
        + 8                     // max_per_day_base_units
        + 8                     // expiry_slot
        + 8                     // daily_window_start_slot
        + 8                     // spent_in_window
        + 8                     // slots_per_window
        + 1;                    // bump
}

#[error_code]
pub enum VaultError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("No policy set on this vault")]
    NoPolicy,
    #[msg("Policy has expired")]
    PolicyExpired,
    #[msg("Amount exceeds per-tx policy limit")]
    AmountExceeded,
    #[msg("Withdraw would exceed the policy daily cap")]
    DailyCapExceeded,
    #[msg("Invalid policy: max_per_day must be >= max_per_tx and slots_per_window > 0")]
    InvalidPolicyLimits,
}
