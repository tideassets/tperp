import hre from "hardhat";
import { Reader } from "../typechain-types";
import { expandDecimals } from "../utils/math";
import got from "got";
import { toLoggableObject } from "../utils/print";
import { getPositionCount, getPositionKeys } from "../utils/position";
const ethers = hre.ethers;

function getAvalancheFujiValues() {
  return {
    oracleApi: "https://synthetics-api-avax-fuji-upovm.ondigitalocean.app/",
  };
}

function getArbibtrumGoerliValues() {
  return {
    oracleApi: "https://gmx-synthetics-api-arb-goerli-4vgxk.ondigitalocean.app/",
  };
}

function getArbitrumValues() {
  return {
    oracleApi: "https://arbitrum-api.gmxinfra.io/",
    referralStorageAddress: "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d",
  };
}

function getValues() {
  if (hre.network.name === "avalancheFuji") {
    return getAvalancheFujiValues();
  } else if (hre.network.name === "arbitrumSepolia") {
    return getArbibtrumGoerliValues();
  } else if (hre.network.name === "arbitrum") {
    return getArbitrumValues();
  } else if (hre.network.name === "localhost") {
    return {
      oracleApi: "https://arbitrum-api.gmxinfra.io/",
    };
  }
  throw new Error("Unsupported network");
}

async function main() {
  const { oracleApi, referralStorageAddress: _referralStorageAddess } = getValues();

  const dataStoreDeployment = await hre.deployments.get("DataStore");
  const dataStore = await hre.ethers.getContractAt("DataStore", dataStoreDeployment.address);
  const positionCount = await getPositionCount(dataStore);
  const positionKeys = await getPositionKeys(dataStore, 0, positionCount);
  const referralStorage = await hre.ethers.getContract("ReferralStorage");

  let referralStorageAddress = _referralStorageAddess;
  if (!referralStorageAddress) {
    referralStorageAddress = await hre.deployments.get("ReferralStorage");
  }

  if (!referralStorageAddress) {
    throw new Error("no referralStorageAddress");
  }

  const reader = (await hre.ethers.getContract("Reader")) as Reader;
  for (const positionKey of positionKeys) {
    const position = await reader.getPosition(dataStoreDeployment.address, positionKey);

    if (position.addresses.market === ethers.constants.AddressZero) {
      console.log("position %s does not exist", positionKey);
      return;
    }

    console.log("position", toLoggableObject(position));

    const marketAddress = position.addresses.market;
    const market = await reader.getMarket(dataStoreDeployment.address, marketAddress);

    console.log("market %s %s %s", market.indexToken, market.longToken, market.shortToken);

    // const tickers: any[] = await got(`${oracleApi}prices/tickers`).json();

    // const prices = ["index", "long", "short"].reduce((acc, key) => {
    //   const token = market[`${key}Token`];
    //   const priceData = tickers.find((data) => {
    //     return data.tokenAddress === token;
    //   });
    //   let minPrice;
    //   let maxPrice;
    //   if (priceData) {
    //     minPrice = priceData.minPrice;
    //     maxPrice = priceData.minPrice;
    //   } else {
    //     throw new Error(`no price data for ${key} token ${token}`);
    //   }
    //   acc[`${key}TokenPrice`] = {
    //     min: minPrice,
    //     max: maxPrice,
    //   };
    //   return acc;
    // }, {} as any[]);
    const wethPrice = { min: expandDecimals(2000, 4), max: expandDecimals(2000, 4) };
    const usdcPrice = { min: expandDecimals(1, 6), max: expandDecimals(1, 6) };
    const prices = { indexTokenPrice: wethPrice, longTokenPrice: wethPrice, shortTokenPrice: usdcPrice };

    console.log("prices", toLoggableObject(prices));

    console.log("reader %s", reader.address);
    console.log("dataStore %s", dataStoreDeployment.address);
    console.log("referralStorageAddress %s", referralStorage.address);

    const positionInfo = await reader.getPositionInfo(
      dataStoreDeployment.address,
      referralStorage.address,
      positionKey,
      prices as any,
      0,
      ethers.constants.AddressZero,
      true
    );

    console.log("position info:", toLoggableObject(positionInfo));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => {
    console.log("Done");
    process.exit(0);
  });
