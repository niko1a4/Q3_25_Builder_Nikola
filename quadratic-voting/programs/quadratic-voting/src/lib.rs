#![allow(deprecated, unexpected_cfgs)]
use anchor_lang::prelude::*;

declare_id!("8qBMo5fgkH2yVSr7jHfCQWc5Ff5QBC6UPk56UaeZJmMQ");
mod state;
use state::*;
#[program]
pub mod quadratic_voting {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
