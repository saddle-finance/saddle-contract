import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute, getOrNull, log } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  if (isTestNetwork(await getChainId())) {
    await deploy("LPTokenV1", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })
  }

  const lpToken = await getOrNull("LPToken")
  if (lpToken) {
    log(`reusing "LPToken" at ${lpToken.address}`)
  } else {
    await deploy("LPToken", {
      from: libraryDeployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "LPToken",
      { from: libraryDeployer, log: true },
      "initialize",
      "Saddle LP Token (Target)",
      "saddleLPTokenTarget",
    )
  }
}
export default func
func.tags = ["LPToken"]
