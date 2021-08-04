import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, get, getOrNull, log, deploy } = deployments
  const { libraryDeployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  await deploy("SynthSwapper", {
    from: libraryDeployer,
    log: true,
    contract: "SynthSwapper",
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["SynthSwapper"]
