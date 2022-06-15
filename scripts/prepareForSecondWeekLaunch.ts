import { ethers } from "hardhat"

import {
  GaugeHelperContract
} from "../build/typechain"
import {
  getCurrentBlockTimestamp,
  increaseTimestamp
} from "../test/testUtils"


/*  tldr:
  *  checks current gauge rewards, moves block timestamp forward one week (86400 * 7 seconds),
  *  checks that rewards have changed and ve boost is accounted for
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
