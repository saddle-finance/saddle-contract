import chai from "chai"
import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

const { expect } = chai
import {
  GaugeController,
  SDL,
  GaugeHelperContract,
  VotingEscrow,
  Minter,
  LiquidityGaugeV5,
} from "../build/typechain/"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../test/testUtils"

chai.use(solidity)

async function main() {
  // at index 0 is hardhat deployer address
  // on localhost network, we use this address as admins for most contracts
  const signers = await ethers.getSigners()

  const gaugeController = (await ethers.getContract(
    "GaugeController",
  )) as GaugeController
  const sdl = (await ethers.getContract("SDL")) as SDL
  const veSDL = (await ethers.getContract("VotingEscrow")) as VotingEscrow
  const minter = (await ethers.getContract("Minter")) as Minter
  const WEEK = 86400 * 7
  const YEAR = WEEK * 52
  const MAXTIME = 86400 * 365 * 4
  const gaugeHelperContract = (await ethers.getContract(
    "GaugeHelperContract",
  )) as GaugeHelperContract

  const numberOfGauges = (await gaugeController.n_gauges()).toNumber()
  const gauges: { name: string; address: string }[] = []

  for (let i = 0; i < numberOfGauges; i++) {
    const address = await gaugeController.gauges(i)
    const gaugeContract = (await ethers.getContractAt(
      "LiquidityGaugeV5",
      address,
    )) as LiquidityGaugeV5

    let name: string
    try {
      name = await gaugeContract.name()
    } catch (e) {
      // In case of root gauges, they don't have a name.
      name = address
    }

    gauges.push({ name, address })
  }

  // The deploy scripts should have already added a default gauge type
  expect((await gaugeController.n_gauge_types()).toNumber()).to.eq(2)
  expect((await gaugeController.gauge_type_names(0)).toString()).to.eq(
    "Liquidity",
  )

  // I can also console.log here
  console.log(
    "sdl balnce of signer[0]: ",
    (await sdl.balanceOf(await signers[0].getAddress())).toString(),
  )

  // Test calling gaugeHelperContract that reads in series
  console.log(
    `${gauges[3].name} address: `,
    await gaugeHelperContract.gaugeToPoolAddress(gauges[3].address),
  )
  console.log(await gaugeHelperContract.gaugeToPoolData(gauges[3].address))

  // You can freely modify timestamps and the state of the contracts to your liking.
  // For how you want to set up the contracts, please refer to test files in test/tokenomics

  // Ensure sdl is not paused
  if (await sdl.paused()) {
    await sdl.enableTransfer()
  }
  await sdl.approve(veSDL.address, MAX_UINT256)

  // Create max lock with 10M SDL
  await veSDL.create_lock(
    BIG_NUMBER_1E18.mul(10_000_000),
    (await getCurrentBlockTimestamp()) + 4 * YEAR,
    { gasLimit: 3_000_000 },
  )
  console.log(
    "(10M SDL/4 Year) lock created at timestamp: ",
    await getCurrentBlockTimestamp(),
  )

  // Only manually trigger mining parameters if rate is 0 (uninitialized)
  const rewardRate = await minter.rate()
  if (rewardRate.eq(0)) {
    await minter.update_mining_parameters()
  }

  for (const gauge of gauges) {
    const gaugeWeight = (
      await gaugeController.get_gauge_weight(gauge.address, {
        gasLimit: 3_000_000,
      })
    ).toString()
    const gaugeRelativeWeight = await gaugeController[
      "gauge_relative_weight(address)"
    ](gauge.address, { gasLimit: 3_000_000 })

    console.log(`${gauge.name} gauge_weight: ${gaugeWeight}`)
    console.log(`${gauge.name} relative_weights: ${gaugeRelativeWeight}`)

    // Imitate multisig setting gauge weights
    await gaugeController.change_gauge_weight(gauge.address, 10000, {
      gasLimit: 3_000_000,
    })
  }

  // Skip to the week after when the weights apply
  await setTimestamp(
    Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
  )
  console.log("timestamp set at", await getCurrentBlockTimestamp())

  for (const gauge of gauges) {
    const gaugeWeight = (
      await gaugeController.get_gauge_weight(gauge.address, {
        gasLimit: 3_000_000,
      })
    ).toString()
    const gaugeRelativeWeight = await gaugeController[
      "gauge_relative_weight(address)"
    ](gauge.address, { gasLimit: 3_000_000 })

    console.log(`${gauge.name} gauge_weight: ${gaugeWeight}`)
    console.log(`${gauge.name} relative_weights: ${gaugeRelativeWeight}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
