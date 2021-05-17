import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy, execute } = deployments
  const { libraryDeployer } = await getNamedAccounts()

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
export default func
func.tags = ["LPToken"]
