import bs58 from "bs58";
import fs from "fs";


const base58Key = "";
const secretKey = bs58.decode(base58Key);


fs.writeFileSync("Turbin3-wallet.json", JSON.stringify(Array.from(secretKey)));