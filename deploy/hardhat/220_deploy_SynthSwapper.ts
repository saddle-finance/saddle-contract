import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

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
