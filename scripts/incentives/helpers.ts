import fs from "fs";
import path from "path";

import { ethers } from "ethers";
import hre from "hardhat";
import { bigNumberify, formatAmount } from "../../utils/math";
import fetch from "node-fetch";

import receiverOverridesMap from "./receiverOverrides";
import { getBatchSenderCalldata } from "./batchSend";

for (const address of Object.keys(receiverOverridesMap)) {
  const checksumAddress = ethers.utils.getAddress(address);
  if (checksumAddress !== address) {
    receiverOverridesMap[checksumAddress] = receiverOverridesMap[address];
    delete receiverOverridesMap[address];
  }
}

const ARBITRUM_SUBGRAPH_ENDPOINT = "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api";
const API_ENDPOINT = "https://arbitrum-api.gmxinfra.io";

export const STIP_LP_DISTRIBUTION_TYPE_ID = 1001;
export const STIP_MIGRATION_DISTRIBUTION_TYPE_ID = 1002;
export const STIP_TRADING_INCENTIVES_DISTRIBUTION_TYPE_ID = 1003;
const TEST_DISTRIBUTION_TYPE_ID = 9876;

export function getDistributionTypeName(distributionTypeId: number) {
  return {
    [STIP_LP_DISTRIBUTION_TYPE_ID]: "STIP LP",
    [STIP_MIGRATION_DISTRIBUTION_TYPE_ID]: "STIP MIGRATION",
    [STIP_TRADING_INCENTIVES_DISTRIBUTION_TYPE_ID]: "STIP TRADING INCENTIVES",
    [TEST_DISTRIBUTION_TYPE_ID]: "TEST",
  }[distributionTypeId];
}

export async function requestSubgraph(query: string) {
  const payload = JSON.stringify({ query });
  const res = await fetch(ARBITRUM_SUBGRAPH_ENDPOINT, {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
  });

  const j = await res.json();
  if (j.errors) {
    throw new Error(JSON.stringify(j));
  }

  return j.data;
}

export function guessBlockNumberByTimestamp(block: ethers.providers.Block, timestamp: number) {
  return block.number - Math.floor((block.timestamp - timestamp) * 3.75);
}

export async function getBlockByTimestamp(timestamp: number) {
  const tolerance = 0; // in seconds
  const latestBlock = await hre.ethers.provider.getBlock("latest");

  console.log(
    "searching block by timestamp %s (%s) latest block: %s %s",
    timestamp,
    new Date(timestamp * 1000).toISOString(),
    latestBlock.number,
    latestBlock.timestamp
  );

  let nextBlockNumber = guessBlockNumberByTimestamp(latestBlock, timestamp);

  const i = 0;
  while (i < 15) {
    console.log("requesting next block %s", nextBlockNumber);
    const block = await hre.ethers.provider.getBlock(nextBlockNumber);

    if (Math.abs(block.timestamp - timestamp) < tolerance) {
      console.log(
        "found block %s %s diff %s",
        block.number,
        block.timestamp,
        new Date(block.timestamp * 1000).toISOString(),
        block.timestamp - timestamp
      );
      return block;
    }

    console.log("%s seconds away", block.timestamp - timestamp);

    nextBlockNumber = guessBlockNumberByTimestamp(block, timestamp);

    if (block.number === nextBlockNumber) {
      console.log("search stopped");
      return block;
    }
  }
  throw new Error("block is not found");
}

export async function requestPrices() {
  const url = new URL(`${API_ENDPOINT}/prices/tickers`);
  const res = await fetch(url);
  const prices = (await res.json()) as {
    maxPrice: string;
    minPrice: string;
    tokenSymbol: string;
    tokenAddress: string;
  }[];

  return prices;
}

export async function requestAllocationData(timestamp: number) {
  const url = new URL(`${API_ENDPOINT}/incentives/stip`);
  url.searchParams.set("timestamp", String(timestamp));
  if (process.env.IGNORE_START_DATE) {
    url.searchParams.set("ignoreStartDate", "1");
  }
  const res = await fetch(url);
  const data = (await res.json()) as {
    lp: {
      isActive: boolean;
      totalRewards: string;
      totalShare: number;
      period: number;
      rewardsPerMarket: Record<string, string>;
    };
    migration: {
      isActive: boolean;
      maxRebateBps: number;
      period: number;
    };
    trading: {
      isActive: boolean;
      rebatePercent: number;
      allocation: string;
      period: number;
    };
  };

  return {
    lp: {
      ...data.lp,
      totalRewards: bigNumberify(data.lp.totalRewards || 0),
      rewardsPerMarket:
        data.lp.rewardsPerMarket &&
        Object.fromEntries(
          Object.entries(data.lp.rewardsPerMarket).map(([marketAddress, rewards]) => {
            return [marketAddress, bigNumberify(rewards)];
          })
        ),
    },
    migration: data.migration,
    trading: {
      ...data.trading,
      allocation: bigNumberify(data.trading.allocation),
    },
  };
}

function getChainId() {
  if (hre.network.name === "arbitrum") {
    return 42161;
  }

  if (hre.network.name === "avax") {
    return 43114;
  }

  throw new Error("Unsupported network");
}

export async function getFrameSigner() {
  try {
    const frame = new ethers.providers.JsonRpcProvider("http://127.0.0.1:1248");
    const signer = frame.getSigner();
    if (getChainId() !== (await signer.getChainId())) {
      throw new Error("Incorrect frame network");
    }
    return signer;
  } catch (e) {
    throw new Error(`getFrameSigner error: ${e.toString()}`);
  }
}

export function overrideReceivers(data: Record<string, string>): void {
  for (const [receiver, amount] of Object.entries(data)) {
    const checksumReceiver = ethers.utils.getAddress(receiver);
    const newReceiver = receiverOverridesMap[checksumReceiver];
    if (!newReceiver) {
      continue;
    }
    console.warn("WARN: override receiver %s -> %s", receiver, newReceiver);
    delete data[receiver];
    if (newReceiver in data) {
      data[newReceiver] = bigNumberify(data[newReceiver]).add(amount).toString();
    } else {
      data[newReceiver] = amount;
    }
  }
}

export function saveDistribution(
  fromDate: Date,
  name: string,
  tokenAddress: string,
  jsonResult: Record<string, string>,
  distributionTypeId: number
) {
  const dateStr = fromDate.toISOString().substring(0, 10);
  const dirpath = path.join(__dirname, "distributions", `epoch_${dateStr}`);
  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath);
  }
  const filename = path.join(dirpath, `${name}_distribution.json`);
  const id = `${dateStr}_${distributionTypeId}`;

  fs.writeFileSync(
    filename,
    JSON.stringify(
      {
        token: tokenAddress,
        distributionTypeId,
        id,
        amounts: jsonResult,
      },
      null,
      4
    )
  );
  console.log("distribution data is saved to %s", filename);

  const amounts = Object.values(jsonResult);
  const totalAmount = amounts.reduce((acc, amount) => acc.add(amount), bigNumberify(0));
  const recipients = Object.keys(jsonResult);
  const batchSenderCalldata = getBatchSenderCalldata(tokenAddress, recipients, amounts, distributionTypeId);
  const filename2 = path.join(dirpath, `${name}_transactionData.json`);
  fs.writeFileSync(
    filename2,
    JSON.stringify(
      {
        totalAmount: totalAmount.toString(),
        batchSenderCalldata,
      },
      null,
      4
    )
  );

  console.log("send batches: %s", Object.keys(batchSenderCalldata).length);
  console.log("batch sender transaction is data saved to %s", filename2);

  const csv = ["recipient,amount"];
  const filename3 = path.join(dirpath, `${name}_distribution.csv`);
  for (const [recipient, amount] of Object.entries(jsonResult)) {
    csv.push(`${recipient},${formatAmount(amount, 18, 2)}`);
  }
  fs.writeFileSync(filename3, csv.join("\n"));
  console.log("csv data saved to %s", filename3);
}

export function processArgs() {
  if (hre.network.name !== "arbitrum") {
    throw new Error("Unsupported network");
  }

  if (!process.env.FROM_DATE) {
    throw new Error("FROM_DATE is required");
  }

  const fromDate = new Date(process.env.FROM_DATE);
  if (fromDate.getDay() !== 3) {
    throw Error(`FROM_DATE should be Wednesday: ${fromDate.getDay()}`);
  }

  const fromTimestamp = Math.floor(+fromDate / 1000);

  let toTimestamp = fromTimestamp + 86400 * 7;

  if (toTimestamp > Date.now() / 1000) {
    if (!process.env.SKIP_EPOCH_VALIDATION) {
      throw new Error("Epoch has not ended yet. Run with SKIP_EPOCH_VALIDATION=1 if this is expected");
    }

    console.warn("WARN: epoch has not ended yet");
    toTimestamp = Math.floor(Date.now() / 1000) - 60;
  }

  const secondsSinceEpochEnded = Date.now() / 1000 - toTimestamp;
  if (secondsSinceEpochEnded > 86400 * 7) {
    const days = Math.floor(secondsSinceEpochEnded / 86400);
    if (!process.env.SKIP_EPOCH_VALIDATION) {
      throw new Error(`Epoch is old ended ${days} days ago. Run with SKIP_EPOCH_VALIDATION=1 if this is expected`);
    }

    console.warn("WARN: epoch is old ended %s days ago", days);
  }

  const toDate = new Date(toTimestamp * 1000);

  return {
    fromTimestamp,
    fromDate,
    toTimestamp,
    toDate,
  };
}
