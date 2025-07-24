use anchor_lang::{
    accounts::program,
    prelude::*,
    system_program::{transfer, Transfer},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    metadata::{MasterEditionAccount, Metadata, MetadataAccount},
    token::{close_account, mint_to, transfer_checked, CloseAccount, MintTo, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    marketplace,
    state::{Listing, Marketplace},
};

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>, // The buyer of the NFT
    pub maker: SystemAccount<'info>,
    #[account(
        seeds = [b"marketplace", marketplace.name.as_str().as_bytes()],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, Marketplace>, // The marketplace configuration account

    pub maker_mint: InterfaceAccount<'info, Mint>, // The NFT mint being listed
    #[account(
        init_if_needed,
        payer=buyer,
        associated_token::mint = maker_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = maker_mint,
        associated_token::authority = listing,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>, // Escrow account for the NFT during listing

    #[account(
        mut,
        seeds = [marketplace.key().as_ref(), maker_mint.key().as_ref()],
        bump,
        close= maker,
        has_one = maker,
        has_one = maker_mint,
    )]
    pub listing: Account<'info, Listing>, // Account to store listing information
    #[account(
    mut,
    seeds = [b"treasury", marketplace.key().as_ref()],
    bump = marketplace.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"rewards", marketplace.key().as_ref()],
        bump= marketplace.rewards_bump,
    )]
    pub reward_mint: InterfaceAccount<'info, Mint>, // Reward token mint for the marketplace
    #[account(
    init_if_needed,
    payer = buyer,
    associated_token::mint = reward_mint,
    associated_token::authority = buyer,
    )]
    pub buyer_rewards_ata: InterfaceAccount<'info, TokenAccount>,

    pub collection_mint: InterfaceAccount<'info, Mint>, // Collection the NFT belongs to

    pub associated_token_program: Program<'info, AssociatedToken>, // For creating ATAs
    pub system_program: Program<'info, System>,                    // For creating accounts
    pub token_program: Interface<'info, TokenInterface>,           // For token operations
}

impl<'info> Purchase<'info> {
    pub fn send_sol(&mut self) -> Result<()> {
        let fee_amount = self.listing.price * self.marketplace.fee as u64 / 10_000;
        let seller_amount = self.listing.price - fee_amount;
        let program = self.system_program.to_account_info();
        let cpi_accounts = Transfer {
            from: self.buyer.to_account_info(),
            to: self.maker.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(program, cpi_accounts);
        transfer(cpi_ctx, seller_amount)?;
        let program = self.system_program.to_account_info();
        let cpi_accounts = Transfer {
            from: self.buyer.to_account_info(),
            to: self.treasury.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(program, cpi_accounts);
        transfer(cpi_ctx, fee_amount)?;
        Ok(())
    }
    pub fn receive_nft(&mut self) -> Result<()> {
        let program = self.token_program.to_account_info();
        let cpi_accounts = TransferChecked {
            from: self.vault.to_account_info(),
            mint: self.maker_mint.to_account_info(),
            to: self.buyer_ata.to_account_info(),
            authority: self.listing.to_account_info(),
        };
        let marketplace_key = self.marketplace.key();
        let maker_mint_key = self.maker_mint.key();
        let seeds = &[
            marketplace_key.as_ref(),
            maker_mint_key.as_ref(),
            &[self.listing.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(program, cpi_accounts, signer_seeds);
        transfer_checked(cpi_ctx, 1, self.maker_mint.decimals)?;
        Ok(())
    }

    pub fn receive_rewards(&mut self) -> Result<()> {
        let program = self.token_program.to_account_info();
        let cpi_accounts = MintTo {
            mint: self.reward_mint.to_account_info(),
            to: self.buyer_rewards_ata.to_account_info(),
            authority: self.marketplace.to_account_info(),
        };
        let seeds = &[
            b"marketplace",
            self.marketplace.name.as_str().as_bytes(),
            &[self.marketplace.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(program, cpi_accounts, signer_seeds);
        mint_to(cpi_ctx, self.listing.price / 100)?;
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
        let cpi_accounts = CloseAccount {
            account: self.vault.to_account_info(),
            destination: self.maker.to_account_info(),
            authority: self.listing.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(program, cpi_accounts, signer_seeds);
        close_account(cpi_ctx)?;

        Ok(())
    }
}
