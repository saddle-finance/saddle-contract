import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const BridgerDeployment = await deploy("ArbitrumBridger", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "ArbitrumBridger",
    args: [1000000, 990000000, 10000000000000],
  })
}
export default func
func.tags = ["ArbBridger"]
