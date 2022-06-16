import { ethers } from "hardhat"

import {
  GaugeHelperContract,
  GaugeController,
  LiquidityGaugeV5,
} from "../build/typechain"
import { getCurrentBlockTimestamp, increaseTimestamp } from "../test/testUtils"

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
  const gauge = await ethers.getContract(USD_V2_GAUGE_NAME)
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

  let index = 1
  const gaugeStartTime = await gaugeController.time_total()

  let gaugeWeights: {
    name: string
    weight: string
    relativeWeight: string
  }[] = []

  for (const gauge of gauges) {
    const gaugeWeight = (
      await gaugeController.get_gauge_weight(gauge.address, {
        gasLimit: 3_000_000,
      })
    ).toString()
    const gaugeRelativeWeight = await gaugeController.callStatic[
      "gauge_relative_weight_write(address,uint256)"
    ](gauge.address, await getCurrentBlockTimestamp(), { gasLimit: 3_000_000 })

    gaugeWeights.push({
      name: gauge.name,
      weight: gaugeWeight,
      relativeWeight: gaugeRelativeWeight.toString(),
    })

    // Imitate multisig setting gauge weights
    await gaugeController.change_gauge_weight(gauge.address, index, {
      gasLimit: 3_000_000,
    })
    index++
  }
  console.log("Table of current gauge weights:")
  console.table(gaugeWeights)

  gaugeWeights = []
  for (const gauge of gauges) {
    const gaugeWeightAfter = (
      await gaugeController.get_gauge_weight(gauge.address, {
        gasLimit: 3_000_000,
      })
    ).toString()

    const gaugeRelativeWeightAfter = await gaugeController.callStatic[
      "gauge_relative_weight_write(address,uint256)"
    ](gauge.address, await gaugeStartTime, { gasLimit: 3_000_000 })
    gaugeWeights.push({
      name: gauge.name,
      weight: gaugeWeightAfter,
      relativeWeight: gaugeRelativeWeightAfter.toString(),
    })
  }
  console.log("Table of gauge weights after assign (for next epoch):")
  console.table(gaugeWeights)

  console.log(
    "claimable rewards for signer[1]:",
    (
      await gaugeHelperContract.getClaimableRewards(
        gauge.address,
        signers[1].address,
      )
    ).toString(),
  )
  console.log(
    "claimable rewards for signer[2]: ",
    (
      await gaugeHelperContract.getClaimableRewards(
        gauge.address,
        signers[2].address,
      )
    ).toString(),
  )
  // advance timestamp 1 week
  console.log("timestamp: ", await getCurrentBlockTimestamp())
  await increaseTimestamp(WEEK)
  console.log("timestamp: ", await getCurrentBlockTimestamp())

  console.log(
    "claimable rewards for signer[1] after a week: ",
    (
      await gaugeHelperContract.getClaimableRewards(
        gauge.address,
        signers[1].address,
      )
    ).toString(),
  )
  console.log(
    "claimable rewards for signer[2] after a week: ",
    (
      await gaugeHelperContract.getClaimableRewards(
        gauge.address,
        signers[2].address,
      )
    ).toString(),
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
