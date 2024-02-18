import { sign } from "crypto";
import hre from "hardhat";

async function main() {
  const oracleStore = await hre.ethers.getContract("OracleStore");
  const signerCount = await oracleStore.getSignerCount();
  const hreSigners = await hre.ethers.getSigners();
  // console.log("hreSigners", hreSigners);
  for (const [index, signer] of hreSigners.entries()) {
    console.log("Signer", index, signer);
    signer.getAddress().then((address) => {
      console.log("Signer", index, "address", address);
    });
  }
  const signers = await oracleStore.getSigners(0, signerCount);
  for (const [index, signer] of signers.entries()) {
    console.log("Signer", index, signer);
  }
  const hreAddresses = hreSigners.map((signer) => signer.address);
  const eqAddresses = hreSigners.filter((signer) => signers.includes(signer.address));
  console.log("eqAddresses", eqAddresses);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
