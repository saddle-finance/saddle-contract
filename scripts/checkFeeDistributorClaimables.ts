import {
  BIG_NUMBER_1E18,
  MAX_UINT256,
  asyncForEach,
  getCurrentBlockTimestamp,
  increaseTimestamp,
  setTimestamp,
} from "../test/testUtils"
import {
  FeeDistributor,
  LPToken,
  Minter,
  SDL,
  Swap,
  VotingEscrow,
} from "../build/typechain"

import { ethers } from "hardhat"

async function main() {
  // at index 0 is hardhat deployer address
  // on localhost network, we use this address as admins for most contracts
  const signers = await ethers.getSigners()

  const sdl = (await ethers.getContract("SDL")) as SDL
  const veSDL = (await ethers.getContract("VotingEscrow")) as VotingEscrow
  const minter = (await ethers.getContract("Minter")) as Minter
  const feeDistributor = (await ethers.getContract(
    "FeeDistributor",
  )) as FeeDistributor
  const DAY = 86400
  const WEEK = 86400 * 7
  const YEAR = WEEK * 52

  // Ensure sdl is not paused
  if (await sdl.paused()) {
    await sdl.enableTransfer()
  }
  await sdl.transfer(minter.address, BIG_NUMBER_1E18.mul(1_000_000))
  await sdl.connect(signers[1]).approve(veSDL.address, MAX_UINT256)

  // Transfer SDL from deployer to signer[1]
  console.log(
    "sdl balance of signer[0]: ",
    (await sdl.balanceOf(await signers[0].getAddress())).toString(),
  )
  await sdl.transfer(signers[1].address, BIG_NUMBER_1E18.mul(1_000_000))
  console.log(
    "sdl balance of signer[1]: ",
    (await sdl.balanceOf(await signers[1].getAddress())).toString(),
  )

  // Create max lock with 10M SDL for signer[0] to get boost
  await sdl.connect(signers[0]).approve(veSDL.address, MAX_UINT256)
  await veSDL
    .connect(signers[0])
    .create_lock(
      BIG_NUMBER_1E18.mul(10_000_000),
      (await getCurrentBlockTimestamp()) + 4 * YEAR,
      { gasLimit: 1_000_000 },
    )
  console.log(
    "signers[0] (10M SDL/4 Year) lock created at timestamp: ",
    await getCurrentBlockTimestamp(),
  )

  // Create max lock with 1M SDL for signer[1] to get boost
  await sdl.connect(signers[1]).approve(veSDL.address, MAX_UINT256)
  await veSDL
    .connect(signers[1])
    .create_lock(
      BIG_NUMBER_1E18.mul(1_000_000),
      (await getCurrentBlockTimestamp()) + 4 * YEAR,
      { gasLimit: 1_000_000 },
    )
  console.log(
    "signers[1] (1M SDL/4 Year) lock created at timestamp: ",
    await getCurrentBlockTimestamp(),
  )

  // Set timestamp to start of next week to ensure consistent results
  await setTimestamp(
    Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
  )

  // Setup contracts to add liquidity to swap pool
  const D4_SWAP_NAME = "SaddleD4Pool"
  const D4_LP_TOKEN_NAME = `${D4_SWAP_NAME}LPToken`
  const swap = (await ethers.getContract(D4_SWAP_NAME)) as Swap
  const lpToken = (await ethers.getContract(D4_LP_TOKEN_NAME)) as LPToken

  // get lp token on signer[0] by adding liquidity to swap pool
  await asyncForEach(["ALUSD", "FEI", "FRAX", "LUSD"], async (token) => {
    await (await ethers.getContract(token)).approve(swap.address, MAX_UINT256)
  })
  await swap.addLiquidity(
    [BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18],
    0,
    MAX_UINT256,
  )

  // Initialize checkpoint by calling it first when empty
  await feeDistributor.checkpoint_token()

  // donate some d4 lp token to fee distributor
  await lpToken.approve(feeDistributor.address, MAX_UINT256)
  await feeDistributor.donate()

  // Running checkpoint here will queue up the rewards for the upcoming week.
  await feeDistributor.checkpoint_token()
  await feeDistributor.checkpoint_total_supply()

  // Ensure new rewards are added
  console.log(
    `Tokens per week: ${await feeDistributor.tokens_per_week(
      Math.floor((await getCurrentBlockTimestamp()) / WEEK) * WEEK,
      { gasLimit: 1_000_000 },
    )}`,
  )

  console.log(
    `claimable rewards for signer[0]: ${(
      await feeDistributor["claimable(address)"](await signers[0].getAddress())
    ).toString()}`,
  )

  console.log(
    `claimable rewards for signer[1]: ${(
      await feeDistributor["claimable(address)"](await signers[1].getAddress())
    ).toString()}`,
  )

  // advance timestamp 1 day
  await increaseTimestamp(DAY)
  await feeDistributor.checkpoint_token()

  console.log(
    `claimable rewards for signer[0] after a day: ${(
      await feeDistributor["claimable(address)"](await signers[0].getAddress())
    ).toString()}`,
  )

  console.log(
    `claimable rewards for signer[1] after a day: ${(
      await feeDistributor["claimable(address)"](await signers[1].getAddress())
    ).toString()}`,
  )

  // Skip to the week after when tokens are donated, and check claimable is not zero
  await increaseTimestamp(WEEK - DAY)
  await feeDistributor.checkpoint_token()

  console.log(
    `claimable rewards for signer[0] after a week: ${(
      await feeDistributor["claimable(address)"](await signers[0].getAddress())
    ).toString()}`,
  )

  console.log(
    `claimable rewards for signer[1] after a week: ${(
      await feeDistributor["claimable(address)"](await signers[1].getAddress())
    ).toString()}`,
  )

  // Check there are no tokens to be distributed for the upcoming week
  console.log(
    `Tokens per week: ${await feeDistributor.tokens_per_week(
      Math.floor((await getCurrentBlockTimestamp()) / WEEK) * WEEK,
      { gasLimit: 1_000_000 },
    )}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
