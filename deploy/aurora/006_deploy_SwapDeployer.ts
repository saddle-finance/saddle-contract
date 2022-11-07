import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute, read } = deployments
  const { deployer, libraryDeployer } = await getNamedAccounts()

  if (isTestNetwork(await getChainId())) {
    await deploy("SwapDeployerV2", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  await deploy("SwapDeployerV2", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["SwapDeployerV2"]
