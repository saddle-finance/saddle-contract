import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { ZERO_ADDRESS } from "../../test/testUtils"
import { ChildChainStreamer } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()

  const REWARDS_ONLY_GAUGE_NAME = "RewardsOnlyGauge"
  const CHILD_CHAIN_STREAMER_NAME = "ChildChainStreamer"
  const REWARD_CLAIMER_NAME = "RewardClaimer"
  const SDL_NAME = "SDL"

  const sdlAddress = (await get(SDL_NAME)).address
  const childChainStreamerAddress = (await get(CHILD_CHAIN_STREAMER_NAME))
    .address
  const rewardClaimerAddress = (await get(REWARD_CLAIMER_NAME)).address

  // First call set_reward_data on RewardClaimer to let them know
  // the reward at index 0 is SDL
  await execute(
    REWARD_CLAIMER_NAME,
    { from: deployer, log: true },
    "set_reward_data",
    0,
    childChainStreamerAddress,
    sdlAddress,
  )
  // If there are more rewards, we need to call set_reward_data again
  // with different index, streamer address, and reward token address

  // Find out 4bytes signature for `ChildChainStreamer.get_reward()`
  const childChainStreamerContract = (await ethers.getContract(
    CHILD_CHAIN_STREAMER_NAME,
  )) as ChildChainStreamer
  const functionFragment =
    childChainStreamerContract.interface.functions["get_reward()"]
  const claimSighash =
    childChainStreamerContract.interface.getSighash(functionFragment)
  const paddedSig = ethers.utils.hexZeroPad(claimSighash, 32)

  // Create an array of addresses with size of 8 (MAX_REWARDS)
  const rewardTokens: string[] = new Array(8).fill(ZERO_ADDRESS)
  rewardTokens[0] = sdlAddress

  // Call set_rewards on rewards only gauge to establish the relationship
  // with RewardClaimer contract
  await execute(
    REWARDS_ONLY_GAUGE_NAME,
    { from: deployer, log: true },
    "set_rewards",
    rewardClaimerAddress,
    paddedSig,
    rewardTokens,
  )
}

export default func
func.tags = ["RootGaugeLocal"]
