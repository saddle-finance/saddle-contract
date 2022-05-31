import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MiniChefV2 } from "../../build/typechain"
import { ethers } from "hardhat"
import { BIG_NUMBER_1E18, getCurrentBlockTimestamp } from "../../test/testUtils"
import { expect } from "chai"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  const minichef: MiniChefV2 = await ethers.getContract("MiniChefV2")
  const now = await getCurrentBlockTimestamp()

  // Only add rewards if current time is before the deadline and if the totalAllocPoint is 1
  if (now < 1653903234 && (await minichef.totalAllocPoint()).toNumber() === 1) {
    // Total LM rewards is 30,000,000 but only 12,500,000 is allocated in the beginning
    // Evmos's portion is 500_000
    const TOTAL_LM_REWARDS = BIG_NUMBER_1E18.mul(500_000)
    // 2 months (8 weeks)
    const lmRewardsPerSecond = TOTAL_LM_REWARDS.div(2 * 4 * 7 * 24 * 3600)

    // expect saddle per second to be 0
    expect(await minichef.saddlePerSecond()).to.eq(0)

    // batch transaction to set the reward rate and pool allocation points
    const batchCall = [
      await minichef.populateTransaction.massUpdatePools([1]),
      await minichef.populateTransaction.setSaddlePerSecond(lmRewardsPerSecond),
      await minichef.populateTransaction.set(
        0,
        0,
        "0x0000000000000000000000000000000000000000",
        false,
      ),
      await minichef.populateTransaction.set(
        1,
        100,
        "0x0000000000000000000000000000000000000000",
        false,
      ),
    ]

    const batchCallData = batchCall.map((x) => x.data)

    // Send batch call
    await execute(
      "MiniChefV2",
      { from: deployer, log: true },
      "batch",
      batchCallData,
      false,
    )
  } else {
    log(`Skipping adding rewards to minichef as its already past the deadline`)
  }
}
export default func
func.dependencies = ["MiniChef"]
