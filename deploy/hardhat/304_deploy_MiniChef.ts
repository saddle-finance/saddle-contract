import { BIG_NUMBER_1E18 } from "../../test/testUtils"

import { ethers } from "hardhat"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MiniChefV2 } from "../../build/typechain"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, get, execute, getOrNull } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  if ((await getOrNull("MiniChefV2")) == null) {
    // Deploy retroactive vesting contract for airdrops
    await deploy("MiniChefV2", {
      from: deployer,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [(await get("SDL")).address],
    })

    const minichef: MiniChefV2 = await ethers.getContract("MiniChefV2")

    // Total LM rewards is 30,000,000 but only 12,500,000 is allocated in the beginning
    const TOTAL_LM_REWARDS = BIG_NUMBER_1E18.mul(12_500_000)
    // 6 months (24 weeks)
    const lmRewardsPerSecond = TOTAL_LM_REWARDS.div(6 * 4 * 7 * 24 * 3600)

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
          await get("SaddleALETHPoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        (
          await get("SaddleD4PoolLPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        (
          await get("SaddleUSDPoolV2LPToken")
        ).address,
        "0x0000000000000000000000000000000000000000",
      ),
      await minichef.populateTransaction.add(
        0,
        (
          await get("SaddleBTCPoolV2LPToken")
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

    // Transfer 1 month worth of LM rewards to MiniChefV2
    await execute(
      "SDL",
      { from: deployer, log: true },
      "transfer",
      (
        await get("MiniChefV2")
      ).address,
      TOTAL_LM_REWARDS.div(6),
    )
  }
}
export default func
func.tags = ["MiniChef"]
