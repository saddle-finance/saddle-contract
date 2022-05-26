import chai from "chai"
import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

const { expect } = chai
import { MiniChefV2 } from "../build/typechain/"
import { BIG_NUMBER_1E18 } from "../test/testUtils"
import { deployments } from "hardhat"
const { execute } = deployments

chai.use(solidity)

async function main() {
  const { deployer } = await ethers.getNamedSigners()

  const minichef: MiniChefV2 = await ethers.getContract("MiniChefV2")

  // Total LM rewards is 30,000,000 but only 12,500,000 is allocated in the beginning
  // Evmos's portion is 500_000
  const TOTAL_LM_REWARDS = BIG_NUMBER_1E18.mul(500_000)
  // 2 months (8 weeks)
  const lmRewardsPerSecond = TOTAL_LM_REWARDS.div(2 * 4 * 7 * 24 * 3600)

  // expect saddle per second to be 0
  expect(await minichef.saddlePerSecond()).to.eq(0)
  console.log("saddlePerSecond", (await minichef.saddlePerSecond()).toString())
  console.log("totalAllocPoint", (await minichef.totalAllocPoint()).toString())

  // batch transaction to set the reward rate and pool allocation points
  const batchCall = [
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
    await minichef.populateTransaction.updatePool(0),
    await minichef.populateTransaction.updatePool(1),
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

  // expect allocation point of all lps to be 100
  console.log("totalAllocPoint", (await minichef.totalAllocPoint()).toString())
  // expect Saddle per second to increase
  console.log("saddlePerSecond", (await minichef.saddlePerSecond()).toString())

  // expect(await minichef.totalAllocPoint).to.eq(100)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
