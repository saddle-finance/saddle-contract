import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const libraryDeployer = (await hre.ethers.getSigners())[1].address

  if (isTestNetwork(await getChainId())) {
    await deploy("SwapUtilsV1", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  await deploy("SwapUtils", {
    from: libraryDeployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["SwapUtils"]
