import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, save } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("Multicall", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  await deploy("Multicall2", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  await deploy("Multicall3", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}

export default func
func.tags = ["Multicall"]
