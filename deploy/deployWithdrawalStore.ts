import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");

  await deploy("WithdrawalStore", {
    from: deployer,
    log: true,
    args: [roleStore.address],
  });
};
func.tags = ["WithdrawalStore"];
func.dependencies = ["RoleStore"];
export default func;
