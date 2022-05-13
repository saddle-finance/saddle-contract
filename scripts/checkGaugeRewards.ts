import chai from "chai"
import { ethers } from "hardhat"
import { solidity } from "ethereum-waffle"

const { expect } = chai
import {
  GaugeController,
  SDL,
  GaugeHelperContract,
  GenericERC20,
  VotingEscrow,
  Minter,
} from "../build/typechain/"
import {
  asyncForEach,
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  increaseTimestamp,
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
  const GaugeHelperContract = (await ethers.getContract(
    "GaugeHelperContract",
  )) as GaugeHelperContract
  //   let rewardToken1: GenericERC20
  const genericERC20Factory = await ethers.getContractFactory("GenericERC20")
  const rewardToken1 = (await genericERC20Factory.deploy(
    "Gauge Reward Token 1",
    "RT1",
    18,
  )) as GenericERC20
  await rewardToken1.mint(signers[0].address, BIG_NUMBER_1E18.mul(1_000_000))
  const rewardToken2 = (await genericERC20Factory.deploy(
    "Gauge Reward Token 2",
    "RT2",
    18,
  )) as GenericERC20
  await rewardToken1.mint(signers[0].address, BIG_NUMBER_1E18.mul(1_000_000))
  console.log(
    "rewardToken1 address, rewardToken1 balance of signer[0]",
    rewardToken1.address,
    (await rewardToken1.balanceOf(signers[0].address)).toString(),
  )
  await rewardToken2.mint(signers[0].address, BIG_NUMBER_1E18.mul(1_000_000))
  console.log(
    "rewardToken2 address, rewardToken1 balance of signer[0]",
    rewardToken2.address,
    (await rewardToken2.balanceOf(signers[0].address)).toString(),
  )

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
  await sdl.transfer(signers[1].address, BIG_NUMBER_1E18.mul(1_000_000))
  console.log(
    "sdl balnce of signer[1]: ",
    (await sdl.balanceOf(await signers[1].getAddress())).toString(),
  )
  // get lp tokens for signers
  const USD_V2_SWAP_NAME = "SaddleUSDPoolV2"
  const USD_V2_LP_TOKEN_NAME = `${USD_V2_SWAP_NAME}LPToken`
  const USD_V2_GAUGE_NAME = `LiquidityGaugeV5_${USD_V2_LP_TOKEN_NAME}`
  const swap = await ethers.getContract(USD_V2_SWAP_NAME)
  const lpToken = await ethers.getContract(USD_V2_LP_TOKEN_NAME)
  const gauge = await ethers.getContract(USD_V2_GAUGE_NAME)

  // get lp token on signer[0] by adding liquidity to swap
  await asyncForEach(["DAI", "USDT", "USDC"], async (token) => {
    await (await ethers.getContract(token)).approve(swap.address, MAX_UINT256)
  })
  console.log("...adding liquidity")
  await swap.addLiquidity(
    [BIG_NUMBER_1E18, ethers.BigNumber.from(1e6), ethers.BigNumber.from(1e6)],
    0,
    MAX_UINT256,
  )
  // transfer lp tokens
  await lpToken.transfer(signers[1].address, BIG_NUMBER_1E18)
  await lpToken.transfer(signers[2].address, BIG_NUMBER_1E18)
  console.log(
    "signer 0 bal: ",
    (await lpToken.balanceOf(signers[0].address)).toString(),
    "signer 1 bal: ",
    (await lpToken.balanceOf(signers[1].address)).toString(),
    "signer 2 bal: ",
    (await lpToken.balanceOf(signers[2].address)).toString(),
  )
  await lpToken.connect(signers[0]).approve(gauge.address, MAX_UINT256)
  await lpToken.connect(signers[1]).approve(gauge.address, MAX_UINT256)
  await lpToken.connect(signers[2]).approve(gauge.address, MAX_UINT256)

  // Ensure sdl is not paused
  if (await sdl.paused()) {
    await sdl.enableTransfer()
  }
  await sdl.connect(signers[1]).approve(veSDL.address, MAX_UINT256)

  // Create max lock with 10M SDL for signer[0] to get boost
  const create_lock_gas_estimate = await veSDL
    .connect(signers[1])
    .estimateGas.create_lock(
      BIG_NUMBER_1E18.mul(1_000_000),
      (await getCurrentBlockTimestamp()) + 4 * YEAR,
    )
  await veSDL
    .connect(signers[1])
    .create_lock(
      BIG_NUMBER_1E18.mul(1_000_000),
      (await getCurrentBlockTimestamp()) + 4 * YEAR,
      { gasLimit: create_lock_gas_estimate },
    )
  console.log(
    "(1M SDL/4 Year) lock created at timestamp: ",
    await getCurrentBlockTimestamp(),
  )
  // set gauge reward to sample tokens
  console.log(
    "rewards before desposits: ",
    await GaugeHelperContract.getGaugeRewards(gauge.address),
  )
  await gauge.add_reward(rewardToken1.address, signers[0].address)
  await gauge.add_reward(rewardToken2.address, signers[0].address)
  await rewardToken1.approve(gauge.address, MAX_UINT256)
  await rewardToken2.approve(gauge.address, MAX_UINT256)
  console.log(
    "rewardToken1 bal",
    (await rewardToken1.balanceOf(signers[0].address)).toString(),
  )
  console.log(
    "rewardToken2 bal",
    (await rewardToken2.balanceOf(signers[0].address)).toString(),
  )
  await gauge.deposit_reward_token(
    rewardToken1.address,
    BIG_NUMBER_1E18.mul(100_000),
  )
  await gauge.deposit_reward_token(
    rewardToken2.address,
    BIG_NUMBER_1E18.mul(100_000),
  )
  console.log(
    "rewardToken bal after deposit",
    (await rewardToken1.balanceOf(signers[0].address)).toString(),
    (await rewardToken2.balanceOf(signers[0].address)).toString(),
  )
  console.log(
    "gauge bal after deposit",
    (await rewardToken1.balanceOf(gauge.address)).toString(),
    (await rewardToken2.balanceOf(gauge.address)).toString(),
  )
  console.log(
    "rewards: ",
    await GaugeHelperContract.getGaugeRewards(gauge.address),
  )
  // Deposit into gauge with boosted account
  await gauge.connect(signers[1])["deposit(uint256)"](BIG_NUMBER_1E18)
  //Deposit into gauge from un-boosted account
  await gauge.connect(signers[2])["deposit(uint256)"](BIG_NUMBER_1E18)
  // Gauge weight is changed mid-week but will apply next week
  const change_gauge_weight_gas_estimate =
    await gaugeController.estimateGas.change_gauge_weight(gauge.address, 0)
  await gaugeController.change_gauge_weight(gauge.address, 0, {
    gasLimit: change_gauge_weight_gas_estimate,
  })

  // Force mine 1 block and then skip timestamp to specified time
  // await setTimestamp((await getCurrentBlockTimestamp()) + 2 * YEAR)

  // await setTimestamp(
  //   Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
  // )
  // await minter.update_mining_parameters()
  // A day passes

  // // skip a year ahead
  // await setTimestamp(
  //   Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * YEAR,
  // )

  console.log(
    "claimable rewards for signer[1]:",
    (
      await GaugeHelperContract.getClaimableRewards(
        gauge.address,
        signers[1].address,
      )
    ).toString(),
  )
  console.log(
    "claimable rewards for signer[2]: ",
    (
      await GaugeHelperContract.getClaimableRewards(
        gauge.address,
        signers[2].address,
      )
    ).toString(),
  )
  // advance 1 day
  await increaseTimestamp(86400)

  console.log(
    "claimable rewards for signer[1] after a day",
    (
      await GaugeHelperContract.getClaimableRewards(
        gauge.address,
        signers[1].address,
      )
    ).toString(),
  )
  console.log(
    "claimable rewards for signer[2] after a day ",
    (
      await GaugeHelperContract.getClaimableRewards(
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
