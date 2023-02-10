import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const libraryDeployer = (await hre.ethers.getSigners())[1].address

  // read the current admin
  await deploy("GaugeHelperContract", {
    from: libraryDeployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await get("MasterRegistry")).address],
  })
}
export default func
func.tags = ["veSDL"]
func.dependencies = ["MasterRegistry"]
