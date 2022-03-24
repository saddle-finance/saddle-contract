import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  await deploy("MetaSwap", {
    from: libraryDeployer,
    log: true,
    libraries: {
      SwapUtils: (await get("SwapUtils")).address,
      MetaSwapUtils: (await get("MetaSwapUtils")).address,
      AmplificationUtils: (await get("AmplificationUtils")).address,
    },
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["MetaSwap"]
func.dependencies = ["AmplificationUtils", "SwapUtils", "MetaSwapUtils"]
