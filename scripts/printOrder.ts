import hre from "hardhat";
import { Reader } from "../typechain-types";
import { toLoggableObject } from "../utils/print";
import { getOrderCount, getOrderKeys } from "../utils/order";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = (await hre.ethers.getContract("Reader")) as Reader;

  const orderCount = await getOrderCount(dataStore);
  const orderKeys = await getOrderKeys(dataStore, 0, orderCount);
  console.log("Order count", orderCount);
  for (const orderKey of orderKeys) {
    const order = await reader.getOrder(dataStore.address, orderKey);
    console.log("Order", toLoggableObject(order));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
