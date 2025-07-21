#![allow(unexpected_cfgs, deprecated)]
use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("F2NcjEZzRfMVXd2Vi6PnUddAuyrMHC2Te5jaPDtDRfk4");

#[program]
pub mod anchor_escrow {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, receive: u64, deposit: u64) -> Result<()> {
        ctx.accounts.init_escrow(seed, receive, &ctx.bumps)?;
        ctx.accounts.deposit(deposit)?;
        Ok(())
    }

    pub fn take(ctx: Context<Take>, seed: u64) -> Result<()> {
        ctx.accounts.deposit()?;
        ctx.accounts.withdraw_and_close()?;
        Ok(())
    }
}
