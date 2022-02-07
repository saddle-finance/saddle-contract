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
      args: [(await get("SDL")).address],
    })

    const minichef: MiniChefV2 = await ethers.getContract("MiniChefV2")

    // Total LM rewards is 30,000,000 but only 12,500,000 is allocated in the beginning
    // Aribtrum's portion is 5_000_000
    const TOTAL_LM_REWARDS = BIG_NUMBER_1E18.mul(5_000_000)
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
        "0xc969dD0A7AB0F8a0C5A69C0839dB39b6C928bC08", // arbUSD pool
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

    // Transfer Ownership to the saddle multisig on arbitrum
    await execute(
      "MiniChefV2",
      { from: deployer, log: true },
      "transferOwnership",
      "0x8e6e84DDab9d13A17806d34B097102605454D147",
      false,
      false,
    )
  }
}
export default func
func.tags = ["MiniChef"]
