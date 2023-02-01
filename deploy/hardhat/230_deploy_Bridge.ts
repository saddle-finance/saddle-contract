import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"
import { CHAIN_ID } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { get, log, deploy } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  if ((await getChainId()) == CHAIN_ID.MAINNET) {
    // Manually check if the pool is already deployed
    await deploy("Bridge", {
      from: deployer,
      log: true,
      contract: "Bridge",
      args: [(await get("SynthSwapper")).address],
      skipIfAlreadyDeployed: true,
    })
  } else {
    log(`deployment is not on mainnet. skipping ${path.basename(__filename)}`)
  }
}
export default func
func.tags = ["Bridge"]
func.dependencies = ["SynthSwapper"]
