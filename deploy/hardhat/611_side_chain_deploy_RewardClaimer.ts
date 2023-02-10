import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

// NOTE: this script is meant to be run on a side chain

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const REWARDS_ONLY_GAUGE_CONTRACT_NAME = "RewardsOnlyGauge"

  const rewardsOnlyGauge = (await get(REWARDS_ONLY_GAUGE_CONTRACT_NAME)).address

  await deploy("RewardClaimer", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [MULTISIG_ADDRESSES[await getChainId()], rewardsOnlyGauge],
  })
}

export default func
func.tags = ["RootGaugeLocal"]
