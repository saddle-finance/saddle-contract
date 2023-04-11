import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("SwapUtilsV2", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["SwapUtilsV2"]
