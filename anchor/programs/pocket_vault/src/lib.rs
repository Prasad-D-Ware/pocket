// pocket_vault — Pocket's onchain policy-enforced sub-account vault.
//
// Day 4 surface (this file): open_vault + deposit.
// Day 5 will add: set_policy + withdraw_under_policy + close_vault.
//
// Architecture: one Vault PDA per (authority) for v1. Authority opens
// the vault once, deposits the policy-asset (USDC for v1), and later
// withdraws under enforced policy. The vault token account is an ATA
// owned by the vault PDA, so the program is the only thing that can
// move funds out — meaning a compromised wallet key cannot drain past
// the policy limits.
//
// v1 targets classic SPL Token only (devnet USDC). Token-2022 paths
// are deferred to v2 — they pull in spl-token-confidential-transfer
// which currently requires a Rust edition newer than the SBF
// platform-tools v1.51 toolchain ships (rustc 1.84 vs needed 1.85).

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

#[error_code]
pub enum VaultError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
}
