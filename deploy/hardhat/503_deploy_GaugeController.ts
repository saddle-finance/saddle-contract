import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("GaugeController", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      (await get("SDL")).address,
      (await get("VotingEscrow")).address,
      (await get("DelegationProxy")).address,
      deployer, // set deployer as admin until all gauges are added
    ],
  })
}
export default func
func.tags = ["veSDL"]
