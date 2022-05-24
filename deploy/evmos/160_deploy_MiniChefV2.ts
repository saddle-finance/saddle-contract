import { BIG_NUMBER_1E18 } from "../../test/testUtils"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MiniChefV2 } from "../../build/typechain"
import { ethers } from "hardhat"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, get, execute, getOrNull, log } = deployments
  const { deployer } = await getNamedAccounts()

  const miniChef = await getOrNull("MiniChefV2")
  if (miniChef) {
    log(`Reusing MiniChefV2 at ${miniChef.address}`)
  } else {
    // Deploy retroactive vesting contract for airdrops
    await deploy("MiniChefV2", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [(await get("DAI")).address],
    })

    const minichef: MiniChefV2 = await ethers.getContract("MiniChefV2")

    // Total LM rewards is 30,000,000 but only 12,500,000 is allocated in the beginning
    // Evmos's portion is 500_000
    const TOTAL_LM_REWARDS = BIG_NUMBER_1E18.mul(500_000)
    // 2 months (8 weeks)
    // const lmRewardsPerSecond = TOTAL_LM_REWARDS.div(2 * 4 * 7 * 24 * 3600)
    const lmRewardsPerSecond = 0

    const batchCall = [
      await minichef.populateTransaction.setSaddlePerSecond(lmRewardsPerSecond),
      await minichef.populateTransaction.add(
        1,
        "0x0000000000000000000000000000000000000000", // blank lp token to enforce totalAllocPoint != 0
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        (
          await get("SaddleEvmos3poolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        (
          await get("SaddleEvmos4PoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        (
          await get("SaddleEvmosBTCPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        (
          await get("SaddleTBTCMetaPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
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
  }
}
export default func
func.tags = ["MiniChef"]
