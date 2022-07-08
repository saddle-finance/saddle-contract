import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  // read the current admin
  await deploy("GaugeHelperContract", {
    from: libraryDeployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [(await get("MasterRegistry")).address],
  })
}
export default func
