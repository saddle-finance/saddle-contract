import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute, getOrNull, log } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  const lpToken = await getOrNull("LPToken")
  if (lpToken) {
    log(`reusing "LPToken" at ${lpToken.address}`)
  } else {
    await deploy("LPTokenV2", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "LPTokenV2",
      { from: libraryDeployer, log: true },
      "initialize",
      "Saddle LP Token (Target)",
      "saddleLPTokenTarget",
    )
  }
}
export default func
func.tags = ["LPTokenV2"]
