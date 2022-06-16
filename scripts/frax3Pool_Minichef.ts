import chai from "chai"
import { ethers } from "hardhat"
import { BigNumber } from "ethers"
import { solidity } from "ethereum-waffle"

const { expect } = chai
import { BIG_NUMBER_1E18 } from "../test/testUtils"
import { deployments } from "hardhat"
const { execute } = deployments

chai.use(solidity)

async function main() {
  const { deployer } = await ethers.getNamedSigners()

  const MyContract = await ethers.getContractFactory("MiniChefV2")
  const minichef = await MyContract.attach(
    "0x691ef79e40d909C715BE5e9e93738B3fF7D58534", // The deployed contract address
  )

  const TOTAL_LM_REWARDS = BIG_NUMBER_1E18.mul(2_000_000)
  // 2 months (8 weeks)
  const frax3poolRewardsPerSecond = TOTAL_LM_REWARDS.div(2 * 4 * 7 * 24 * 3600)
  const currentSDLPerSecond = await minichef.saddlePerSecond()
  //   const newSDLPerSecond = currentSDLPerSecond.add(frax3poolRewardsPerSecond)
  const newSDLPerSecond = BigNumber.from(1635846757684555302)
  const pids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  // for i in pids

  const batchCall = [
    await minichef.massUpdatePools([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    await minichef.populateTransaction.setSaddlePerSecond(1635846757684555302),
    await minichef.add(
      11,
      "0x0785aDDf5F7334aDB7ec40cD785EBF39bfD91520",
      "0x0000000000000000000000000000000000000000",
    ),
    await minichef.populateTransaction.set(
      1,
      67,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      2,
      33,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      3,
      33,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      4,
      33,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      8,
      33,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      9,
      67,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      10,
      3,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      11,
      68,
      "0x0000000000000000000000000000000000000000",
      false,
    ),

    await minichef.massUpdatePools([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  ]

  const batchCallData = batchCall.map((x) => x.data)

  // Send batch call
  await execute(
    "MiniChefV2",
    { from: deployer.address, log: true },
    "batch",
    batchCallData,
    false,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
