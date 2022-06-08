import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, execute, get, getOrNull, save, read } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("SwapCalculator", {
    from: deployer,
    log: true,
    contract: "SwapCalculator",
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["SwapCalculator"]
