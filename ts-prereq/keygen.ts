import { Keypair } from "@solana/web3.js";

const kp = Keypair.generate();
console.log(`You have generated a new Solana wallet: ${kp.publicKey.toBase58()} `);
console.log(`Secret key: [${kp.secretKey}]`);