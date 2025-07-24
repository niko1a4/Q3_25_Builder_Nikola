use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{close_account, transfer_checked, CloseAccount, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::state::{listing, Listing, Marketplace};

#[derive(Accounts)]
pub struct Delist<'info> {
    #[account(mut)]
    pub maker: Signer<'info>, // The NFT owner creating the listing

    #[account(
        seeds = [b"marketplace", marketplace.name.as_str().as_bytes()],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, Marketplace>, // The marketplace configuration account

    pub maker_mint: InterfaceAccount<'info, Mint>, // The NFT mint being listed
    #[account(
        mut,
        associated_token::mint = maker_mint,
        associated_token::authority = maker,
    )]
    pub maker_ata: InterfaceAccount<'info, TokenAccount>, // Token account holding the NFT

    #[account(
        mut,
        associated_token::mint = maker_mint,
        associated_token::authority = listing,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>, // Escrow account for the NFT during listing

    #[account(
        mut,
        close = maker,
        seeds = [marketplace.key().as_ref(), maker_mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>, // Account to store listing information
    pub associated_token_program: Program<'info, AssociatedToken>, // For creating ATAs
    pub system_program: Program<'info, System>,                    // For creating accounts
    pub token_program: Interface<'info, TokenInterface>,           // For token operations
}

impl<'info> Delist<'info> {
    pub fn delist(&mut self) -> Result<()> {
        let program = self.token_program.to_account_info();
        let marketplace_key = self.marketplace.key();
        let maker_mint_key = self.maker_mint.key();
        let seeds = &[
            marketplace_key.as_ref(),
            maker_mint_key.as_ref(),
            &[self.listing.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            mint: self.maker_mint.to_account_info(),
            to: self.maker_ata.to_account_info(),
            authority: self.listing.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(program, cpi_accounts, signer_seeds);
        transfer_checked(cpi_ctx, 1, self.maker_mint.decimals)?;
        Ok(())
    }
    pub fn close_mint_vault(&mut self) -> Result<()> {
        let program = self.token_program.to_account_info();
        let marketplace_key = self.marketplace.key();
        let maker_mint_key = self.maker_mint.key();
        let seeds = &[
            marketplace_key.as_ref(),
            maker_mint_key.as_ref(),
            &[self.listing.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let accounts = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.listing.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(program, accounts, signer_seeds);
        close_account(cpi_ctx)?;
        Ok(())
    }
}
