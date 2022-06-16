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
  GenericERC20,
  IPoolRegistry,
} from "../build/typechain"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  asyncForEach,
  ZERO_ADDRESS,
} from "../test/testUtils"
chai.use(solidity)

/**
 * Adds liquidity to all pools with a gauge.
 * Deploys and mints two dummy tokens and
 * adds them as a reward to the USDv2 gauge.
 * Transfers USdv2 LP tokens to signers[1] and
 * signers[2].
 * Transfers SDL to signer[1] and creates a max
 * length lock for veSDL.
 * Both signers deposit their LP into the USDv2 gauge.
 */

async function main() {
  const signers = await ethers.getSigners()

  const gaugeController = (await ethers.getContract(
    "GaugeController",
  )) as GaugeController
  const sdl = (await ethers.getContract("SDL")) as SDL
  const veSDL = (await ethers.getContract("VotingEscrow")) as VotingEscrow
  const minter = (await ethers.getContract("Minter")) as Minter
  const WEEK = 86400 * 7
  const YEAR = WEEK * 52
  const gaugeHelperContract = (await ethers.getContract(
    "GaugeHelperContract",
  )) as GaugeHelperContract

  const numberOfGauges = (await gaugeController.n_gauges()).toNumber()
  const gauges: { name: string; address: string }[] = []

  const poolDataArray: IPoolRegistry.PoolDataStruct[] = []

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
    const poolData = await gaugeHelperContract.gaugeToPoolData(address)
    poolDataArray.push(poolData)

    // For only base pools
    if (poolData.metaSwapDepositAddress === ZERO_ADDRESS) {
      // get swap contract object form poolData.poolAddress
      const swapContract = await ethers.getContractAt(
        "Swap",
        poolData.poolAddress,
      )
      // get array of token contracts from poolData.tokens
      // these tokens are the tokens for the above swap contract
      const tokenContracts = await Promise.all(
        poolData.tokens.map(
          async (tokenAddress) =>
            await ethers.getContractAt("GenericERC20", tokenAddress),
        ),
      )
      await asyncForEach(tokenContracts, async (tokenContract) => {
        await tokenContract.approve(swapContract.address, MAX_UINT256)
      })
      const tokenDecimals = await Promise.all(
        tokenContracts.map(async (tokenContract) => tokenContract.decimals()),
      )

      const tokenInputs = tokenDecimals.map((decimal) =>
        ethers.BigNumber.from(10).pow(decimal),
      )
      // add liquidity accoridng to base pool decimals for base pool of gauge
      await swapContract.addLiquidity(tokenInputs, 0, MAX_UINT256)
    }
  }

  // The deploy scripts should have already added a default gauge type (should not include root gauges for)
  expect((await gaugeController.n_gauge_types()).toNumber()).to.eq(1)
  expect((await gaugeController.gauge_type_names(0)).toString()).to.eq(
    "Liquidity",
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

  // Only manually trigger mining parameters if rate is 0 (uninitialized)
  const rewardRate = await minter.rate()
  if (rewardRate.eq(0)) {
    await minter.update_mining_parameters()
  }

  // deploy and mint dummy tokens to be used as rewards in the gauge
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
  await rewardToken2.mint(signers[0].address, BIG_NUMBER_1E18.mul(1_000_000))
  console.log(
    "rewardToken1 address, rewardToken1 balance of signer[0]",
    rewardToken1.address,
    (await rewardToken1.balanceOf(signers[0].address)).toString(),
  )

  // setup contracts names
  const USD_V2_SWAP_NAME = "SaddleUSDPoolV2"
  const USD_V2_LP_TOKEN_NAME = `${USD_V2_SWAP_NAME}LPToken`
  const USD_V2_GAUGE_NAME = `LiquidityGaugeV5_${USD_V2_LP_TOKEN_NAME}`
  const lpToken = await ethers.getContract(USD_V2_LP_TOKEN_NAME)
  const gauge = await ethers.getContract(USD_V2_GAUGE_NAME)

  // add sample tokens as gauges rewards to USDv2 gauge
  console.log(
    "rewards before desposits: ",
    await gaugeHelperContract.getGaugeRewards(gauge.address),
  )
  await gauge.add_reward(rewardToken1.address, signers[0].address)
  await gauge.add_reward(rewardToken2.address, signers[0].address)
  await rewardToken1.approve(gauge.address, MAX_UINT256)
  await rewardToken2.approve(gauge.address, MAX_UINT256)

  // deposit reward tokens into gauge
  await gauge.deposit_reward_token(
    rewardToken1.address,
    BIG_NUMBER_1E18.mul(100_000),
  )
  await gauge.deposit_reward_token(
    rewardToken2.address,
    BIG_NUMBER_1E18.mul(100_000),
  )
  console.log(
    "rewards after desposits: ",
    await gaugeHelperContract.getGaugeRewards(gauge.address),
  )

  await sdl.transfer(minter.address, BIG_NUMBER_1E18.mul(1_000_000))
  await sdl.connect(signers[1]).approve(veSDL.address, MAX_UINT256)
  // Transfer SDL from deployer to signer[1]
  await sdl.transfer(signers[1].address, BIG_NUMBER_1E18.mul(1_000_000))

  // transfer lp tokens from deployer to signers
  await lpToken.transfer(signers[1].address, BIG_NUMBER_1E18)
  await lpToken.transfer(signers[2].address, BIG_NUMBER_1E18)
  await lpToken.connect(signers[0]).approve(gauge.address, MAX_UINT256)
  await lpToken.connect(signers[1]).approve(gauge.address, MAX_UINT256)
  await lpToken.connect(signers[2]).approve(gauge.address, MAX_UINT256)

  // Create max lock with .8M SDL for signer[1] to get boost
  await sdl.approve(veSDL.address, MAX_UINT256)
  const create_lock_gas_estimate = await veSDL
    .connect(signers[1])
    .estimateGas.create_lock(
      BIG_NUMBER_1E18.mul(800_000),
      (await getCurrentBlockTimestamp()) + 4 * YEAR,
    )
  await veSDL
    .connect(signers[1])
    .create_lock(
      BIG_NUMBER_1E18.mul(800_000),
      (await getCurrentBlockTimestamp()) + 4 * YEAR,
      { gasLimit: create_lock_gas_estimate },
    )
  console.log(
    "(1M SDL/4 Year) lock created at timestamp: ",
    await getCurrentBlockTimestamp(),
  )

  // Deposit into gauge with boosted account
  console.log(
    "totalt supply of gauge: ",
    (await gauge.totalSupply()).toString(),
  )
  await gauge.connect(signers[1])["deposit(uint256)"](BIG_NUMBER_1E18)
  //Deposit into gauge from un-boosted account
  await gauge.connect(signers[2])["deposit(uint256)"](BIG_NUMBER_1E18)
  console.log(
    "total supply of gauge after deposits: ",
    (await gauge.totalSupply()).toString(),
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
