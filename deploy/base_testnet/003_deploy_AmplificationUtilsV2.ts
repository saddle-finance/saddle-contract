import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("AmplificationUtilsV2", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["AmplificationUtilsV2"]
