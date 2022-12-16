import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const libraryDeployer = (await hre.ethers.getSigners())[1].address

  if (isTestNetwork(await getChainId())) {
    await deploy("AmplificationUtilsV1", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  await deploy("AmplificationUtils", {
    from: libraryDeployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["AmplificationUtils"]
