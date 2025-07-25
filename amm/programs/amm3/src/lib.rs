#![allow(deprecated, unexpected_cfgs)]
use anchor_lang::prelude::*;
mod error;
mod instructions;
mod state;
use instructions::*;
declare_id!("E1MtJZn5p34E2SSr41XdFWRRx8erjpWhKtef6Yc3tWQ9");

#[program]
pub mod amm3 {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        seed: u64,
        fee: u16,
        authority: Option<Pubkey>,
    ) -> Result<()> {
        ctx.accounts.init(seed, fee, authority, ctx.bumps)?;
        Ok(())
    }
    pub fn deposit(ctx: Context<Deposit>, amount: u64, max_x: u64, max_y: u64) -> Result<()> {
        ctx.accounts.deposit(amount, max_x, max_y)?;
        Ok(())
    }
    pub fn swap(ctx: Context<Swap>, is_x: bool, amount: u64, min: u64) -> Result<()> {
        ctx.accounts.swap(is_x, amount, min)?;
        Ok(())
    }
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64, min_x: u64, min_y: u64) -> Result<()> {
        ctx.accounts.withdraw(amount, min_x, min_y)?;
        Ok(())
    }
}
