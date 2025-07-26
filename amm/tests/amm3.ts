import * as anchor from "@coral-xyz/anchor";
import {
  Program,
  AnchorProvider,
  web3,
  BN,
} from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createMint,
  getAccount,
  getMint,
  mintTo,
} from "@solana/spl-token";
import { Amm3 } from "../target/types/amm3";
import { expect } from "chai";

describe("initialize AMM", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Amm3 as Program<Amm3>;

  // Test key
  const initializer = provider.wallet;

  // Mints
  let mintX: PublicKey;
  let mintY: PublicKey;

  // Config seed
  const seed = new BN(42);

  //  (PDAs)
  let configPda: PublicKey;
  let mintLpPda: PublicKey;
  let vaultXPda: PublicKey;
  let vaultYPda: PublicKey;

  it("Initializes AMM config", async () => {
    // 1. Mint token X i Y
    mintX = await createMint(provider.connection, initializer.payer, initializer.publicKey, null, 6);
    mintY = await createMint(provider.connection, initializer.payer, initializer.publicKey, null, 6);

    // 2.PDA derivation
    [configPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("config"), seed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [mintLpPda] = await PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), configPda.toBuffer()],
      program.programId
    );

    vaultXPda = getAssociatedTokenAddressSync(mintX, configPda, true);
    vaultYPda = getAssociatedTokenAddressSync(mintY, configPda, true);

    // 3. Initialize call
    await program.methods
      .initialize(seed, 30, null) // fee = 30, authority = null
      .accounts({
        initializer: initializer.publicKey,
        mintX,
        mintY,
        mintLp: mintLpPda,
        vaultX: vaultXPda,
        vaultY: vaultYPda,
        config: configPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([]) // no additional signers
      .rpc();

    // 4. Assert Config account
    const configAccount = await program.account.config.fetch(configPda);
    console.log("✅ Config:", configAccount);

    // 5. Assert vaults are created
    const vaultX = await getAccount(provider.connection, vaultXPda);
    const vaultY = await getAccount(provider.connection, vaultYPda);
    console.log("✅ Vault X owner:", vaultX.owner.toBase58());
    console.log("✅ Vault Y owner:", vaultY.owner.toBase58());

    expect(vaultX.owner.toBase58()).to.equal(configPda.toBase58());
    expect(vaultY.owner.toBase58()).to.equal(configPda.toBase58());

    // 6. Assert mint_lp has authority = config
    const mintLp = await getMint(provider.connection, mintLpPda);
    expect(mintLp.mintAuthority?.toBase58()).to.equal(configPda.toBase58());
    console.log("✅ Mint LP authority:", mintLp.mintAuthority?.toBase58());
  });
  let userXPda: PublicKey;
  let userYPda: PublicKey;
  let userLpPda: PublicKey;
  it("Deposits tokens and mints LP", async () => {
    userXPda = getAssociatedTokenAddressSync(mintX, initializer.publicKey);
    userYPda = getAssociatedTokenAddressSync(mintY, initializer.publicKey);
    userLpPda = getAssociatedTokenAddressSync(mintLpPda, initializer.publicKey);
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      initializer.payer,
      mintLpPda,
      initializer.publicKey
    );
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      initializer.payer,
      mintX,
      initializer.publicKey
    );
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      initializer.payer,
      mintY,
      initializer.publicKey
    );

    // Mint user X and Y tokens
    await mintTo(
      provider.connection,
      initializer.payer,
      mintX,
      userXPda,
      initializer.publicKey,
      1_000_000
    );
    await mintTo(
      provider.connection,
      initializer.payer,
      mintY,
      userYPda,
      initializer.publicKey,
      2_000_000
    );

    const amountLp = new BN(1_000);

    await program.methods
      .deposit(amountLp, new BN(1_000_000), new BN(2_000_000))
      .accounts({
        user: initializer.publicKey,
        mintX,
        mintY,
        mintLp: mintLpPda,
        vaultX: vaultXPda,
        vaultY: vaultYPda,
        userX: userXPda,
        userY: userYPda,
        userLp: userLpPda,
        config: configPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const userLp = await getAccount(provider.connection, userLpPda);
    console.log("✅ LP minted to user:", userLp.amount);
    expect(Number(userLp.amount)).to.equal(amountLp.toNumber());
  });

  it("Swaps tokens via AMM", async () => {

    await mintTo(
      provider.connection,
      initializer.payer,
      mintX,
      userXPda,
      initializer.publicKey,
      1_000_000
    );
    // User will swap X → Y 
    // Here we swap 500_000 X → Y

    const amountX = new BN(500_000);
    const minY = new BN(1);

    await program.methods
      .swap(true, amountX, minY)
      .accounts({
        user: initializer.publicKey,
        mintX,
        mintY,
        vaultX: vaultXPda,
        vaultY: vaultYPda,
        userX: userXPda,
        userY: userYPda,
        config: configPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const userXPost = await getAccount(provider.connection, userXPda);
    const userYPost = await getAccount(provider.connection, userYPda);

    console.log("✅ User X after swap:", userXPost.amount);
    console.log("✅ User Y after swap:", userYPost.amount);

    expect(Number(userXPost.amount)).to.be.lessThan(1_200_000);

  });

  it("Withdraws LP and receives tokens", async () => {
    const amountLp = new BN(1_000);
    const userLpPda = getAssociatedTokenAddressSync(mintLpPda, initializer.publicKey);

    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      initializer.payer,
      mintLpPda,
      configPda,
      true
    );

    await program.methods
      .withdraw(amountLp, new BN(1), new BN(1)) // min_x, min_y
      .accounts({
        user: initializer.publicKey,
        mintX,
        mintY,
        mintLp: mintLpPda,
        vaultX: vaultXPda,
        vaultY: vaultYPda,
        userX: userXPda,
        userY: userYPda,
        userLp: userLpPda,
        config: configPda,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const lpFinal = await getAccount(provider.connection, userLpPda);
    const userX = await getAccount(provider.connection, userXPda);
    const userY = await getAccount(provider.connection, userYPda);

    console.log("✅ LP burned. Final LP amount:", lpFinal.amount);
    console.log("✅ User X:", userX.amount);
    console.log("✅ User Y:", userY.amount);

    expect(Number(lpFinal.amount)).to.equal(0);
    expect(Number(userX.amount)).to.be.greaterThan(0);
    expect(Number(userY.amount)).to.be.greaterThan(0);
  });

});
