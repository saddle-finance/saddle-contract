import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("VotingEscrow", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("SDL")).address,
      "Vote-escrowed SDL",
      "veSDL",
      deployer, // temporarily set owner to deployer
    ],
  })
}
export default func
func.tags = ["veSDL"]
func.dependencies = ["SDL"]
