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
  //   const sdl = (await ethers.getContract("SDL")) as SDL

  const TOTAL_LM_REWARDS = BIG_NUMBER_1E18.mul(5_000_000)
  // 6 months (24 weeks)
  const lmRewardsPerSecond = TOTAL_LM_REWARDS.div(6 * 4 * 7 * 24 * 3600)

  // expect saddle per second to be 0
  expect(await minichef.saddlePerSecond()).to.eq(0)

  // set the saddle per second to new rate
  console.log("saddlePerSecond", (await minichef.saddlePerSecond()).toString())
  await minichef.setSaddlePerSecond(lmRewardsPerSecond)
  console.log("saddlePerSecond", (await minichef.saddlePerSecond()).toString())
  expect(await minichef.saddlePerSecond()).to.eq(lmRewardsPerSecond)
  console.log("totalAllocPoint", (await minichef.totalAllocPoint()).toString())

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
    await minichef.populateTransaction.set(
      2,
      100,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      3,
      100,
      "0x0000000000000000000000000000000000000000",
      false,
    ),
    await minichef.populateTransaction.set(
      4,
      100,
      "0x0000000000000000000000000000000000000000",
      false,
    ),

    await minichef.populateTransaction.updatePool(1),
    await minichef.populateTransaction.updatePool(2),
    await minichef.populateTransaction.updatePool(3),
    await minichef.populateTransaction.updatePool(4),
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

  //   expect(await minichef.totalAllocPoint).to.eq(400)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
