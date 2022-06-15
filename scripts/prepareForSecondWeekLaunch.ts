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
  GenericERC20
} from "../build/typechain"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
  asyncForEach,
  increaseTimestamp
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
