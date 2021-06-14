import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { CHAIN_ID } from "../utils/network"
import { MULTISIG_ADDRESS } from "../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  if ((await getChainId()) == CHAIN_ID.HARDHAT) {
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
func.dependencies = ["AmplificationUtils", "SwapUtils"]
