import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  // Manually check if the pool is already deployed
  await deploy("SynthSwapper", {
    from: deployer,
    log: true,
    contract: "SynthSwapper",
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["SynthSwapper"]
