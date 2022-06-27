import { ethers } from "hardhat"

import {
  GaugeHelperContract,
  GaugeController,
  LiquidityGaugeV5,
} from "../build/typechain"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  increaseTimestamp,
} from "../test/testUtils"

/**
 * Interface used for the state of each gauge's weights.
 *
 * @interface GaugeWeight
 * @name {string} name of the gauge. will be the address if name doesnt exist
 * @weight {string} weight of the gauge
 * @relativeWeight {string} relative weight of the gauge
 */
interface GaugeWeight {
  name: string
  weight: string
  relativeWeight: string
}

/**
 * Logs current gauge weights.
 * Sets different gauge weights for each gauge.
 * Logs what future gauge weights will change to after epoch.
 * Logs current claimable rewards.
 * Fast forwards time to the next epoch(1 week).
 * Logs claimable rewards after fast forwarding.
 */

async function main() {
  // at index 0 is hardhat deployer address
  // on localhost network, we use this address as admins for most contracts
  const signers = await ethers.getSigners()

  const WEEK = 86400 * 7

  const gaugeHelperContract = (await ethers.getContract(
    "GaugeHelperContract",
  )) as GaugeHelperContract

  // You can freely modify timestamps and the state of the contracts to your liking.
  // For how you want to set up the contracts, please refer to test files in test/tokenomics

  const USD_V2_SWAP_NAME = "SaddleUSDPoolV2"
  const USD_V2_LP_TOKEN_NAME = `${USD_V2_SWAP_NAME}LPToken`
  const USD_V2_GAUGE_NAME = `LiquidityGaugeV5_${USD_V2_LP_TOKEN_NAME}`
  const usdV2Gauge: LiquidityGaugeV5 = await ethers.getContract(
    USD_V2_GAUGE_NAME,
  )
  const gaugeController = (await ethers.getContract(
    "GaugeController",
  )) as GaugeController

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

  // Start of next epoch. Assumes checkpoint has been already called.
  const gaugeStartTime = await gaugeController.time_total()

  // Log current gauge weights and change the relative weights so that
  // it is different from the initial weights.
  const currentGaugeWeights: GaugeWeight[] = []
  const currentBlockTimestamp = await getCurrentBlockTimestamp()
  for (let i = 0; i < gauges.length; i++) {
    const gauge = gauges[i]

    // Get live raw gauge weight
    const gaugeWeight = (
      await gaugeController.get_gauge_weight(gauge.address, {
        gasLimit: 3_000_000,
      })
    ).toString()

    // Get live relative gauge weight at current timestamp
    const gaugeRelativeWeight = await gaugeController.callStatic[
      "gauge_relative_weight_write(address,uint256)"
    ](gauge.address, currentBlockTimestamp, { gasLimit: 3_000_000 })

    // Store current gauge weight
    currentGaugeWeights.push({
      name: gauge.name,
      weight: gaugeWeight,
      relativeWeight: gaugeRelativeWeight.toString(),
    })

    // Imitate multisig setting gauge weights for the next epoch
    await gaugeController.change_gauge_weight(
      gauge.address,
      gauges.length - i, // Set the weights as the inverse of the index
      {
        gasLimit: 3_000_000,
      },
    )
  }
  console.log(`Table of current gauge weights @ ${currentBlockTimestamp}:`)
  console.table(currentGaugeWeights)

  // Log next epoch's gauge weights.
  const futureGaugeWeights: GaugeWeight[] = []
  for (const gauge of gauges) {
    // Get live raw gauge weight
    const gaugeWeightAfter = (
      await gaugeController.get_gauge_weight(gauge.address, {
        gasLimit: 3_000_000,
      })
    ).toString()

    // Get the relative weight of the gauge at the next epoch.
    const gaugeRelativeWeightAfter = await gaugeController.callStatic[
      "gauge_relative_weight_write(address,uint256)"
    ](gauge.address, gaugeStartTime, { gasLimit: 3_000_000 })

    // Store the future gauge weight.
    futureGaugeWeights.push({
      name: gauge.name,
      weight: gaugeWeightAfter,
      relativeWeight: gaugeRelativeWeightAfter.toString(),
    })
  }
  console.log(
    `Table of gauge weights after assign for next epoch @ ${gaugeStartTime}:`,
  )
  console.table(futureGaugeWeights)

  // Log claimable rewards for signers[1] and signers[2] staking in usdV2Gauge
  for (let i = 1; i < 3; i++) {
    const signer = signers[i]
    const claimableRewards = await gaugeHelperContract.getClaimableRewards(
      usdV2Gauge.address,
      signer.address,
    )
    console.log(
      `${USD_V2_GAUGE_NAME} Claimable rewards for signer[${i}] ${signer.address}: ${claimableRewards}`,
    )
  }

  // Log working balances for signers[1] and signers[2] in usdV2Gauge
  for (let i = 1; i < 3; i++) {
    const signer = signers[i]
    const workingBalance = await usdV2Gauge.working_balances(signer.address)
    const balanceOf = await usdV2Gauge.balanceOf(signer.address)
    const boost = ethers.utils.formatUnits(
      workingBalance.mul(BIG_NUMBER_1E18).div(balanceOf).mul(25).div(10),
      18,
    )

    console.log(
      `${USD_V2_GAUGE_NAME} Working balance for signer[${i}] ${signer.address}: ${workingBalance}`,
    )
    console.log(
      `${USD_V2_GAUGE_NAME} BalanceOf for signer[${i}]       ${signer.address}: ${balanceOf}`,
    )
    console.log(
      `${USD_V2_GAUGE_NAME} Boost for signer[${i}]       ${signer.address}: ${boost}`,
    )
  }

  // advance timestamp 1 week
  console.log("timestamp: ", await getCurrentBlockTimestamp())
  await increaseTimestamp(WEEK)
  console.log("timestamp: ", await getCurrentBlockTimestamp())

  // Log claimable rewards for signers[1] and signers[2]
  for (let i = 1; i < 3; i++) {
    const signer = signers[i]
    const claimableRewards = await gaugeHelperContract.getClaimableRewards(
      usdV2Gauge.address,
      signer.address,
    )
    console.log(
      `${USD_V2_GAUGE_NAME} Claimable rewards for signer[${i}] ${signer.address}: ${claimableRewards}`,
    )
  }

  // Call user_checkpoint() to update working_balances of signer[1] and signer[2]
  for (let i = 1; i < 3; i++) {
    const signer = signers[i]
    await usdV2Gauge
      .connect(signer)
      .user_checkpoint(signer.address, { gasLimit: 3_000_000 })
    console.log(
      `${USD_V2_GAUGE_NAME} Called user_checkpoint for signer[${i}] ${signer.address}`,
    )
  }

  // Log working balances for signers[1] and signers[2] in usdV2Gauge
  for (let i = 1; i < 3; i++) {
    const signer = signers[i]
    const workingBalance = await usdV2Gauge.working_balances(signer.address)
    const balanceOf = await usdV2Gauge.balanceOf(signer.address)
    const boost = ethers.utils.formatUnits(
      workingBalance.mul(BIG_NUMBER_1E18).div(balanceOf).mul(25).div(10),
      18,
    )

    console.log(
      `${USD_V2_GAUGE_NAME} Working balance for signer[${i}] ${signer.address}: ${workingBalance}`,
    )
    console.log(
      `${USD_V2_GAUGE_NAME} BalanceOf for signer[${i}]       ${signer.address}: ${balanceOf}`,
    )
    console.log(
      `${USD_V2_GAUGE_NAME} Boost for signer[${i}]       ${signer.address}: ${boost}`,
    )
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
