import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get } = deployments
  const { deployer } = await getNamedAccounts()

  const BridgerDeployment = await deploy("RewardForwarder", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    contract: "ArbitrumBridger",
    args: ["gauge addr"],
  })
}
export default func
func.tags = ["RewardForwarder"]
