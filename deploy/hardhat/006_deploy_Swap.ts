import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const libraryDeployer = (await hre.ethers.getSigners())[1].address

  if (isTestNetwork(await getChainId())) {
    await deploy("SwapV1", {
      from: libraryDeployer,
      log: true,
      libraries: {
        SwapUtilsV1: (await get("SwapUtilsV1")).address,
        AmplificationUtilsV1: (await get("AmplificationUtilsV1")).address,
      },
      skipIfAlreadyDeployed: true,
    })
  }

  await deploy("Swap", {
    from: libraryDeployer,
    log: true,
    libraries: {
      SwapUtils: (await get("SwapUtils")).address,
      AmplificationUtils: (await get("AmplificationUtils")).address,
    },
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["Swap"]
func.dependencies = ["AmplificationUtils", "SwapUtils", "LPToken"]
