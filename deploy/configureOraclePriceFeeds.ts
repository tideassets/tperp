import { ethers } from "ethers";

import { TokenConfig } from "../config/tokens";
import { expandDecimals } from "../utils/math";
import * as keys from "../utils/keys";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
  const { execute, read, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { oracle, tokens } = gmx;

  for (const tokenSymbol of Object.keys(oracle.priceFeeds || {})) {
    const token = tokens[tokenSymbol] as TokenConfig;
    const priceFeedKey = keys.priceFeedKey(token.address);

    const priceFeed = oracle.priceFeeds[tokenSymbol];
    const priceFeedAddress = ethers.utils.getAddress(priceFeed.address);

    const storedPriceFeedAddress = await read("DataStore", "getAddress", priceFeedKey);
    if (priceFeedAddress !== storedPriceFeedAddress) {
      log("setting price feed for %s to %s", tokenSymbol, priceFeedAddress);
      await execute("DataStore", { from: deployer, log: true }, "setAddress", priceFeedKey, priceFeedAddress);
    }

    const priceFeedPrecisionKey = keys.priceFeedPrecisionKey(token.address);
    const storedPrecision = await read("DataStore", "getUint", priceFeedPrecisionKey);
    // formula for decimals for price feed precision: 60 - (external price feed decimals) - (token decimals)

    const priceFeedPrecision = expandDecimals(1, 60 - priceFeed.decimals - token.decimals);
    if (priceFeedPrecision !== storedPrecision) {
      log("setting price feed precision for " + tokenSymbol + " to " + priceFeedPrecision.toString());
      await execute("DataStore", { from: deployer, log: true }, "setUint", priceFeedPrecisionKey, priceFeedPrecision);
    }
  }
};
func.tags = ["OracleTokens"];
func.dependencies = ["Oracle", "OracleStore", "DataStore", "Tokens", "PriceFeeds"];
export default func;
