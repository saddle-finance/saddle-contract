import chai from "chai"
import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

const { expect } = chai
import {
  GaugeController,
  SDL,
  HelperContract,
  VotingEscrow,
  Minter,
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
  const helperContract = (await ethers.getContract(
    "HelperContract",
  )) as HelperContract
  const gauge_map = new Map<string, string>([
    [
      "LiquidityGaugeV5_SaddleALETHPoolLPToken",
      (await ethers.getContract("LiquidityGaugeV5_SaddleALETHPoolLPToken"))
        .address,
    ],
    [
      "LiquidityGaugeV5_SaddleBTCPoolV2LPToken",
      (await ethers.getContract("LiquidityGaugeV5_SaddleBTCPoolV2LPToken"))
        .address,
    ],
    [
      "LiquidityGaugeV5_SaddleD4PoolLPToken",
      (await ethers.getContract("LiquidityGaugeV5_SaddleD4PoolLPToken"))
        .address,
    ],
    [
      "LiquidityGaugeV5_SaddleSUSDMetaPoolUpdatedLPToken",
      (
        await ethers.getContract(
          "LiquidityGaugeV5_SaddleSUSDMetaPoolUpdatedLPToken",
        )
      ).address,
    ],
    [
      "LiquidityGaugeV5_SaddleTBTCMetaPoolUpdatedLPToken",
      (
        await ethers.getContract(
          "LiquidityGaugeV5_SaddleTBTCMetaPoolUpdatedLPToken",
        )
      ).address,
    ],
    [
      "LiquidityGaugeV5_SaddleUSDPoolV2LPToken",
      (
        await ethers.getContract("LiquidityGaugeV5_SaddleUSDPoolV2LPToken")
      ).address.toString(),
    ],
    [
      "LiquidityGaugeV5_SaddleWCUSDMetaPoolUpdatedLPToken",
      (
        await ethers.getContract(
          "LiquidityGaugeV5_SaddleWCUSDMetaPoolUpdatedLPToken",
        )
      ).address.toString(),
    ],
  ])
  // array of all keys in gauge_addresses
  const gauge_names = Array.from(gauge_map.keys())
  // array of all values in gauge_addresses
  const gauge_addresses = Array.from(gauge_map.values())

  // The deploy scripts should have already added a default gauge type
  expect((await gaugeController.n_gauge_types()).toNumber()).to.eq(1)
  expect((await gaugeController.gauge_type_names(0)).toString()).to.eq("Gauge")

  // The deploy scripts should have also deployed gauges for
  // all of the existing LP tokens and added them to the gauge controller
  expect((await gaugeController.n_gauges()).toNumber()).to.eq(7)

  // I can also console.log here
  console.log(
    "sdl balnce of signer[0]: ",
    (await sdl.balanceOf(await signers[0].getAddress())).toString(),
  )

  // Test calling helperContract that reads in series
  console.log(
    "usdv2Gauge.address: ",
    await helperContract.gaugeToPoolAddress(gauge_addresses[5]),
  )
  console.log(await helperContract.gaugeToPoolData(gauge_addresses[5]))

  // You can freely modify timestamps and the state of the contracts to your liking.
  // For how you want to set up the contracts, please refer to test files in test/tokenomics

  // Ensure sdl is not paused
  if (await sdl.paused()) {
    await sdl.enableTransfer()
  }
  await sdl.approve(veSDL.address, MAX_UINT256)

  // Create max lock with 10M SDL
  const create_lock_gas_estimate = await veSDL.estimateGas.create_lock(
    BIG_NUMBER_1E18.mul(10_000_000),
    (await getCurrentBlockTimestamp()) + 4 * YEAR,
  )
  await veSDL.create_lock(
    BIG_NUMBER_1E18.mul(10_000_000),
    (await getCurrentBlockTimestamp()) + 4 * YEAR,
    { gasLimit: create_lock_gas_estimate },
  )
  console.log(
    "(10M SDL/4 Year) lock created at timestamp: ",
    await getCurrentBlockTimestamp(),
  )

  // Force mine 1 block and then skip timestamp to specified time
  await setTimestamp((await getCurrentBlockTimestamp()) + 2 * YEAR)

  await setTimestamp(
    Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
  )
  await minter.update_mining_parameters()

  let get_gauge_weight_gas_estimate =
    await gaugeController.estimateGas.get_gauge_weight(gauge_addresses[0])
  let get_relative_gauge_weight_gas_estimate =
    await gaugeController.estimateGas["gauge_relative_weight(address)"](
      gauge_addresses[0],
    )
  let i
  const change_gauge_weight_gas_estimate =
    await gaugeController.estimateGas.change_gauge_weight(
      gauge_addresses[0],
      10000,
    )
  for (i = 0; i < gauge_names.length; i++) {
    console.log(
      gauge_names[i],
      "gauge_weight: ",
      (
        await gaugeController.get_gauge_weight(gauge_addresses[i], {
          gasLimit: get_gauge_weight_gas_estimate,
        })
      ).toString(),
    )
    console.log(
      gauge_names[i],
      "relative_weights: ",
      (
        await gaugeController["gauge_relative_weight(address)"](
          gauge_addresses[i],
          { gasLimit: get_relative_gauge_weight_gas_estimate },
        )
      ).toString(),
    )

    // // Imitate multisig setting gauge weights
    await gaugeController.change_gauge_weight(gauge_addresses[i], 10000, {
      gasLimit: change_gauge_weight_gas_estimate,
    })
  }

  // // Skip to the week after when the weights apply
  await setTimestamp(
    Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
  )
  console.log("timestamp set at", await getCurrentBlockTimestamp())
  get_gauge_weight_gas_estimate =
    await gaugeController.estimateGas.get_gauge_weight(gauge_addresses[0])
  get_relative_gauge_weight_gas_estimate = await gaugeController.estimateGas[
    "gauge_relative_weight(address)"
  ](gauge_addresses[0])
  for (i = 0; i < gauge_names.length; i++) {
    console.log(
      gauge_names[i],
      "gauge_weight: ",
      (
        await gaugeController.get_gauge_weight(gauge_addresses[i], {
          gasLimit: get_gauge_weight_gas_estimate,
        })
      ).toString(),
    )
    console.log(
      gauge_names[i],
      "relative_weights: ",
      (
        await gaugeController["gauge_relative_weight(address)"](
          gauge_addresses[i],
          { gasLimit: get_relative_gauge_weight_gas_estimate },
        )
      ).toString(),
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
