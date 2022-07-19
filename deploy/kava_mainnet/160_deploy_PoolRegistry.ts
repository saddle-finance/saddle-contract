import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("PoolRegistry", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [deployer, deployer],
  })
  // NOTE: both manager and admin role are given to deployer since gnosis safe is not working on kava
}
export default func
func.tags = ["PoolRegistry"]
