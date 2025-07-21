import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js"
import { assert } from "chai";


describe("escrow make", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet;
  const program = anchor.workspace.anchor_escrow;

  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerAtaA: PublicKey;
  let vault: PublicKey;
  let escrowPda: PublicKey;
  let seed = new BN(42);
  let bump: number;
  const deposit_amount = new BN(1000);
  const receive_amount = new BN(500);

  before(async () => {
    //airdrop if needed
    const sig = await provider.connection.requestAirdrop(
      wallet.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    //create mint A and B
    mintA = await createMint(provider.connection, wallet.payer, wallet.publicKey, null, 6);
    mintB = await createMint(provider.connection, wallet.payer, wallet.publicKey, null, 6);

    //create ATA for maker
    const makerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintA,
      wallet.publicKey
    );
    makerAtaA = makerAta.address;

    //mint 1000 tokens to A maker
    await mintTo(
      provider.connection,
      wallet.payer,
      mintA,
      makerAtaA,
      wallet.payer,
      deposit_amount.toNumber() * 10 ** 0 //we use 6 decimals above
    );

    //derive escrow PDA
    [escrowPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), wallet.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    //derive vault ATA (for escrow)
    vault = getAssociatedTokenAddressSync(mintA, escrowPda, true);
  });

  it("starts make and sends tokens to the vault", async () => {
    const tx = await program.methods
      .make(seed, receive_amount, deposit_amount)
      .accounts({
        maker: wallet.publicKey,
        mintA,
        mintB,
        makerAtaA,
        escrow: escrowPda,
        vault,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).rpc();

    console.log("Make tx:", tx);

    //check if vault has 1000 tokens now
    const vaultAccount = await getAccount(provider.connection, vault);
    const vaultAmount = Number(vaultAccount.amount);
    assert.strictEqual(vaultAmount, deposit_amount.toNumber());
  });
  it("completes take and closes vault", async () => {
    // create a second wallet pair (taker)
    const taker = anchor.web3.Keypair.generate();
    //airdrop sol to taker
    const sig = await provider.connection.requestAirdrop(taker.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);

    //derive ATA fro taker
    const takerAtaB = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintB,
      taker.publicKey,
    );
    const takerAtaA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mintA,
      taker.publicKey,
    );

    //mint token B to taker so they can pay  maker
    await mintTo(
      provider.connection,
      wallet.payer,
      mintB,
      takerAtaB.address,
      wallet.payer,
      receive_amount.toNumber(),
    );

    // Derive ATA for maker to receive token B
    const makerAtaB = getAssociatedTokenAddressSync(mintB, wallet.publicKey);

    const tx = await program.methods
      .take(seed)
      .accounts({
        taker: taker.publicKey,
        maker: wallet.publicKey,
        mintA,
        mintB,
        makerAtaB,
        takerAtaA: takerAtaA.address,
        takerAtaB: takerAtaB.address,
        escrow: escrowPda,
        vault,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    console.log("Take tx:", tx);

    //Check taker received 1000 token A 
    const takerA = await getAccount(provider.connection, takerAtaA.address);
    assert.strictEqual(Number(takerA.amount), deposit_amount.toNumber());
    //check maker received 500 token B
    const makerB = await getAccount(provider.connection, makerAtaB);
    assert.strictEqual(Number(makerB.amount), receive_amount.toNumber());

    //check vault is now empty and closed

    try {
      await getAccount(provider.connection, vault);
      throw new Error("Vault should be closed but still exists");
    } catch (err) {
      // OK, vault is now closed
    }
  });
});
