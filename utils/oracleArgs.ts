import { bigNumberify } from "./math";
import { getOracleParams, TOKEN_ORACLE_TYPES } from "./oracle";
import { hashData } from "../utils/hash";
import hre from "hardhat";

export async function getExecuteArgs(overrides) {
  const {
    oracleBlocks,
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
  } = overrides;
  const { provider } = hre.ethers;
  const block = await provider.getBlock(bigNumberify(oracleBlockNumber).toNumber());
  const tokenOracleTypes =
    overrides.tokenOracleTypes || Array(tokens.length).fill(TOKEN_ORACLE_TYPES.DEFAULT, 0, tokens.length);

  let minOracleBlockNumbers = [];
  let maxOracleBlockNumbers = [];
  let oracleTimestamps = [];
  let blockHashes = [];

  if (oracleBlocks) {
    for (let i = 0; i < oracleBlocks.length; i++) {
      const oracleBlock = oracleBlocks[i];
      minOracleBlockNumbers.push(oracleBlock.number);
      maxOracleBlockNumbers.push(oracleBlock.number);
      oracleTimestamps.push(oracleBlock.timestamp);
      blockHashes.push(oracleBlock.hash);
    }
  } else {
    minOracleBlockNumbers =
      overrides.minOracleBlockNumbers || Array(tokens.length).fill(block.number, 0, tokens.length);

    maxOracleBlockNumbers =
      overrides.maxOracleBlockNumbers || Array(tokens.length).fill(block.number, 0, tokens.length);

    oracleTimestamps = overrides.oracleTimestamps || Array(tokens.length).fill(block.timestamp, 0, tokens.length);

    blockHashes = Array(tokens.length).fill(block.hash, 0, tokens.length);
  }

  const oracleSalt = hashData(["uint256", "string"], [hre.network.config.chainId, "xget-oracle-v1"]);

  const args = {
    oracleSalt,
    minOracleBlockNumbers,
    maxOracleBlockNumbers,
    oracleTimestamps,
    blockHashes,
    signerIndexes,
    tokens,
    tokenOracleTypes,
    precisions,
    minPrices,
    maxPrices,
    signers,
    realtimeFeedTokens,
    realtimeFeedData,
    priceFeedTokens,
  };

  return await getOracleParams(args);
}
