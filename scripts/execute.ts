import hre from "hardhat";
import { expandDecimals } from "../utils/math";
import { getExecuteArgs } from "../utils/oracleArgs";
import { getDepositCount, getDepositKeys } from "../utils/deposit";
import { getOrderCount, getOrderKeys } from "../utils/order";
import { getWithdrawalCount, getWithdrawalKeys } from "../utils/withdrawal";
import { ExchangeRouter } from "../typechain-types";

async function executeOp(execute, getCount, getKeys, getOp) {
  const dataStoreAddress = (await hre.deployments.get("DataStore")).address;
  const dataStore = await hre.ethers.getContractAt("DataStore", dataStoreAddress);
  const oracleStore = await hre.ethers.getContract("OracleStore");

  const signerCount = await oracleStore.getSignerCount();
  const oracle_signers = await oracleStore.getSigners(0, signerCount);
  const signers = (await hre.ethers.getSigners()).filter((signer) => oracle_signers.includes(signer.address));
  const signerIndexes = signers.map((signer) => oracle_signers.indexOf(signer.address));
  const weth = await hre.ethers.getContract("WETH");
  const usdc = await hre.ethers.getContract("USDC");
  const tokens = [weth.address, usdc.address];
  const precisions = [8, 18];
  const minPrices = [expandDecimals(3000, 4), expandDecimals(1, 6)];
  const maxPrices = [expandDecimals(3000, 4), expandDecimals(1, 6)];

  const count = await getCount(dataStore);
  const keys = await getKeys(dataStore, 0, count);
  for (const key of keys) {
    const entry = await getOp(dataStore.address, key);
    const oracleBlockNumber = entry.numbers.updatedAtBlock;
    const realtimeFeedTokens = [];
    const realtimeFeedData = [];
    const priceFeedTokens = [];

    const params = {
      oracleBlockNumber,
      tokens,
      signers,
      signerIndexes,
      precisions,
      minPrices,
      maxPrices,
      realtimeFeedTokens,
      realtimeFeedData,
      priceFeedTokens,
    };

    console.log("execute ", key, params);
    const args = await getExecuteArgs(params);
    console.log("execute ", args);

    try {
      const tx = await execute(key, args, {
        gasLimit: 10000000,
      });
      console.log("executesend:", tx.hash);
      await tx.wait();
      console.log("execute success:", tx.hash);
    } catch (ex) {
      console.error("execute error", ex);
    }
  }
}

async function executeDeposit() {
  const readerAddress = (await hre.deployments.get("Reader")).address;
  const reader = await hre.ethers.getContractAt("Reader", readerAddress);
  const depositHandler = await hre.ethers.getContract("DepositHandler");
  executeOp(depositHandler.executeDeposit, getDepositCount, getDepositKeys, reader.getDeposit);
}

async function executeOrder() {
  const readerAddress = (await hre.deployments.get("Reader")).address;
  const reader = await hre.ethers.getContractAt("Reader", readerAddress);
  const orderHandler = await hre.ethers.getContract("OrderHandler");
  await executeOp(orderHandler.executeOrder, getOrderCount, getOrderKeys, reader.getOrder);
}

async function executeWithdrawal() {
  const readerAddress = (await hre.deployments.get("Reader")).address;
  const reader = await hre.ethers.getContractAt("Reader", readerAddress);
  const withdrawalHandler = await hre.ethers.getContract("WithdrawalHandler");
  executeOp(withdrawalHandler.executeWithdrawal, getWithdrawalCount, getWithdrawalKeys, reader.getWithdrawal);
}

async function cancelDeposit() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const depositLength = await getDepositCount(dataStore);
  const depositKeys = await getDepositKeys(dataStore, 0, depositLength);
  const exchangeRouter: ExchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  for (const depositKey of depositKeys) {
    console.log("depositKey", depositKey);
    const result = await exchangeRouter.callStatic.cancelDeposit(depositKey, {
      gasLimit: 8000000,
    });
    console.log("call result", result);
    const tx = await exchangeRouter.cancelDeposit(depositKey, {
      gasLimit: 8000000,
    });
    await tx.wait();
  }
}

async function cancelWithdrawal() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const exchangeRouter: ExchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const count = await getWithdrawalCount(dataStore);
  const keys = await getWithdrawalKeys(dataStore, 0, count);
  for (const key of keys) {
    console.log("key", key);
    const result = await exchangeRouter.callStatic.cancelWithdrawal(key, {
      gasLimit: 8000000,
    });
    console.log("call result", result);
    const tx = await exchangeRouter.cancelWithdrawal(key, {
      gasLimit: 8000000,
    });
    await tx.wait();
  }
}
async function cancelOrder() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const exchangeRouter: ExchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const count = await getOrderCount(dataStore);
  const keys = await getOrderKeys(dataStore, 0, count);
  for (const key of keys) {
    console.log("key", key);
    const result = await exchangeRouter.callStatic.cancelOrder(key, {
      gasLimit: 8000000,
    });
    console.log("call result", result);
    const tx = await exchangeRouter.cancelOrder(key, {
      gasLimit: 8000000,
    });
    await tx.wait();
  }
}

async function main() {
  const action = process.env.ACTION;
  console.log("do ...", action);
  if (action === "executeDeposit") {
    await executeDeposit();
  } else if (action === "executeOrder") {
    await executeOrder();
  } else if (action === "executeWithdrawal") {
    await executeWithdrawal();
  } else if (action === "cancelDeposit") {
    await cancelDeposit();
  } else if (action === "cancelOrder") {
    await cancelOrder();
  } else if (action === "cancelWithdrawal") {
    await cancelWithdrawal();
  } else {
    throw new Error("invalid action");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
