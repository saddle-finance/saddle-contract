import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  if (isTestNetwork(await getChainId())) {
    await deploy("SwapFlashLoanV1", {
      from: libraryDeployer,
      log: true,
      libraries: {
        SwapUtilsV1: (await get("SwapUtilsV1")).address,
        AmplificationUtilsV1: (await get("AmplificationUtilsV1")).address,
      },
      skipIfAlreadyDeployed: true,
    })
  }

  await deploy("SwapFlashLoan", {
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
func.tags = ["SwapFlashLoan"]
func.dependencies = ["AmplificationUtils", "SwapUtils", "LPToken"]
