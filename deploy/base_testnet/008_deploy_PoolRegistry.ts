import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("PoolRegistry", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [deployer, deployer],
  })
}
export default func
func.tags = ["PoolRegistry"]
