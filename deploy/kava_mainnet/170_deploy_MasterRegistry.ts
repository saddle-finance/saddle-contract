import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read } = deployments
  const { deployer } = await getNamedAccounts()

  const masterRegistry = await getOrNull("MasterRegistry")

  if (masterRegistry == null) {
    await deploy("MasterRegistry", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [deployer],
    })

    await execute(
      "MasterRegistry",
      { from: deployer, log: true },
      "addRegistry",
      ethers.utils.formatBytes32String("PoolRegistry"),
      (
        await get("PoolRegistry")
      ).address,
    )
  }
}
export default func
func.tags = ["MasterRegistry"]
