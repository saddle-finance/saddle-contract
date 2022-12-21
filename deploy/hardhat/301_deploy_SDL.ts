import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, get, execute, getOrNull } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const unlockPeriod = isTestNetwork(await getChainId()) ? 1 : 7890000 // 3 months in seconds

  await deploy("SDL", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [deployer, unlockPeriod, (await get("Vesting")).address],
  })
}
export default func
func.tags = ["SDL"]
func.dependencies = ["Vesting"]
