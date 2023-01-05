import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

// NOTE: this script is meant to be run on a side chain

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const REWARD_CLAIMER_CONTRACT_NAME = "RewardClaimer"

  const rewardClaimer = (await get(REWARD_CLAIMER_CONTRACT_NAME)).address

  // note, that we reuse the SDL from "mainnet" here,
  // since we test on single network. In prod, the last
  // parameter will be the SDL address from the side chain
  await deploy("ChildChainStreamer", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [
      MULTISIG_ADDRESSES[await getChainId()],
      rewardClaimer,
      (await get("SDL")).address,
    ],
  })
}

export default func
func.tags = ["RootGaugeLocal"]
