import wallet from "/home/andre/.config/solana/id.json"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi"
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"
import { readFile } from "fs/promises"
import { create } from "domain"

// Create a devnet connection
const umi = createUmi('https://devnet.helius-rpc.com/?api-key=71d05d9f-5d94-4548-9137-c6c3d9f69b3e');

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader());
umi.use(signerIdentity(signer));

(async () => {
    try {
        //1. Load image
        const image = await readFile("./MogRug.png");
        //2. Convert image to generic file.
        const genericFile = createGenericFile(image, "MogRug.png", {
            contentType: "image/png",
        })
        //3. Upload image
        const [myUri] = await umi.uploader.upload([genericFile]);
        console.log(`Your image URI: ${myUri}`);
    }
    catch (error) {
        console.log("Oops.. Something went wrong", error);
    }
})();
