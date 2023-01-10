import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore"];

const func = createDeployFunction({
  contractName: "MarketStore",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
});

export default func;
