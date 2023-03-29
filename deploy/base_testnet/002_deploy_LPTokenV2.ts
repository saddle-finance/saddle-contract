import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, execute, getOrNull, log } = deployments
  const { deployer } = await getNamedAccounts()

  const lpToken = await getOrNull("LPTokenV2")
  if (lpToken) {
    log(`reusing "LPTokenV2" at ${lpToken.address}`)
  } else {
    await deploy("LPTokenV2", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
    })

    await execute(
      "LPTokenV2",
      { from: deployer, log: true },
      "initialize",
      "Saddle LP Token (Target)",
      "saddleLPTokenTarget",
    )
  }
}
export default func
func.tags = ["LPTokenV2"]
