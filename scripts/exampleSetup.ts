import chai from "chai"
import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

const { expect } = chai
import { GaugeController, SDL, HelperContract } from "../build/typechain/"

chai.use(solidity)

async function main() {
  // at index 0 is hardhat deployer address
  // on localhost network, we use this address as admins for most contracts
  const signers = await ethers.getSigners()

  const gaugeController = (await ethers.getContract(
    "GaugeController",
  )) as GaugeController
  const sdl = (await ethers.getContract("SDL")) as SDL
  const helperContract = (await ethers.getContract(
    "HelperContract",
  )) as HelperContract
  const usdv2Gauge = await ethers.getContract(
    "LiquidityGaugeV5_SaddleUSDPoolV2LPToken",
  )

  // The deploy scripts should have already added a default gauge type
  expect((await gaugeController.n_gauge_types()).toNumber()).to.eq(1)
  expect((await gaugeController.gauge_type_names(0)).toString()).to.eq("Gauge")

  // The deploy scripts should have also deployed gauges for
  // all of the existing LP tokens and added them to the gauge controller
  expect((await gaugeController.n_gauges()).toNumber()).to.eq(7)

  // I can also console.log here
  console.log((await sdl.balanceOf(await signers[0].getAddress())).toString())

  // Test calling helperContract that reads in series
  console.log(
    (await helperContract.gaugeToPoolAddress(usdv2Gauge.address)).toString(),
  )
  console.log(await helperContract.gaugeToPoolData(usdv2Gauge.address))

  // You can freely modify timestamps and the state of the contracts to your liking.
  // below is pseudocode example and will not work without importing the correct types
  //
  // // Ensure sdl is not paused
  // if (await sdl.paused()) {
  //   await sdl.enableTransfer()
  // }
  // await sdl.approve(veSDL.address, MAX_UINT256)

  // Create max lock with 10M SDL
  // await veSDL.create_lock(
  //   BIG_NUMBER_1E18.mul(10_000_000),
  //   await getCurrentBlockTimestamp() + 4 years,
  // )
  //
  // Force mine 1 block and then skip timestamp to specified time
  // await setTimestamp( await getCurrentBlockTimestamp() + 2 years)

  // For how you want to set up the contracts, please refer to test files in test/tokenomics
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
