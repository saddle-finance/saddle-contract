import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import {
  SDL,
  VotingEscrow,
  LPToken,
  Swap,
  FeeDistributor,
} from "../../build/typechain/"
import {
  asyncForEach,
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"

const { expect } = chai

const WEEK = 86400 * 7
const MAXTIME = 86400 * 365 * 4
const LOCK_START_TIMESTAMP = 2362003200

const USD_V2_SWAP_NAME = "SaddleUSDPoolV2"
const USD_V2_LP_TOKEN_NAME = `${USD_V2_SWAP_NAME}LPToken`
const USD_V2_GAUGE_NAME = `LiquidityGaugeV5_${USD_V2_LP_TOKEN_NAME}`
const VESDL_NAME = "VotingEscrow"

describe("Fee Distributor [ @skip-on-coverage ]", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let deployerAddress: string
  let veSDL: VotingEscrow
  let sdl: SDL
  let lpToken: LPToken
  let feeDistributor: FeeDistributor

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["USDPoolV2", "veSDL"], {
        fallbackToGlobal: false,
      })

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )
      deployerAddress = users[0]

      const swap: Swap = await ethers.getContract(USD_V2_SWAP_NAME)
      lpToken = await ethers.getContract(USD_V2_LP_TOKEN_NAME)
      veSDL = await ethers.getContract(VESDL_NAME)

      const feeDistributorFactory = await ethers.getContractFactory(
        "FeeDistributor",
      )

      feeDistributor = (await feeDistributorFactory.deploy(
        veSDL.address,
        (
          await ethers.getContract("VeSDLRewards")
        ).address,
        await getCurrentBlockTimestamp(),
        lpToken.address,
        deployerAddress,
        deployerAddress,
      )) as FeeDistributor

      await asyncForEach(["DAI", "USDT", "USDC"], async (token) => {
        await (
          await ethers.getContract(token)
        ).approve(swap.address, MAX_UINT256)
      })

      await swap.addLiquidity(
        [BIG_NUMBER_1E18, BigNumber.from(1e6), BigNumber.from(1e6)],
        0,
        MAX_UINT256,
      )
      await lpToken.approve(feeDistributor.address, MAX_UINT256)

      sdl = await ethers.getContract("SDL")
      veSDL = await ethers.getContract("VotingEscrow")

      // Ensure test setup is correct
      if (await sdl.paused()) {
        await sdl.enableTransfer()
      }

      // Set timestamp to start of the week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )

      // Create max lock from deployer address
      await sdl.approve(veSDL.address, MAX_UINT256)
      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        (await getCurrentBlockTimestamp()) + MAXTIME,
      )
      await sdl.transfer(users[10], BIG_NUMBER_1E18.mul(5_000_000))

      // Create half max lock from user[10] address
      await sdl.connect(signers[10]).approve(veSDL.address, MAX_UINT256)
      await veSDL
        .connect(signers[10])
        .create_lock(
          BIG_NUMBER_1E18.mul(5_000_000),
          (await getCurrentBlockTimestamp()) + MAXTIME - 2 * 52 * WEEK,
        )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("claim", () => {
    it(`Successfully claims based on veSDL balance`, async () => {
      // Set timestamp to start of next week to ensure consistent test results
      const startTimestamp =
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK
      await setTimestamp(startTimestamp)

      // Initialize checkpoint by calling it first when empty
      await feeDistributor.checkpoint_token()

      // Checkpoint some tokens
      await lpToken.transfer(feeDistributor.address, BIG_NUMBER_1E18)
      await feeDistributor.checkpoint_token()
      await feeDistributor.checkpoint_total_supply()

      // Ensure new rewards are added to this week (pending)
      expect(
        await feeDistributor.tokens_per_week(
          Math.floor((await getCurrentBlockTimestamp()) / WEEK) * WEEK,
        ),
      ).to.eq(BIG_NUMBER_1E18)

      // Half a week passes. Since the week is not over yet, no rewards are distributed
      await setTimestamp(startTimestamp + WEEK / 2)
      await feeDistributor.checkpoint_token()
      expect(await feeDistributor["claimable(address)"](deployerAddress)).to.eq(
        0,
      )
      expect(await feeDistributor["claimable(address)"](users[10])).to.eq(0)

      // Another half week passes. Now that the full week is past, after calling
      // checkpoint_token, last week's rewards become distributable.
      await setTimestamp(startTimestamp + WEEK)
      await feeDistributor.checkpoint_token()
      expect(await feeDistributor["claimable(address)"](deployerAddress)).to.eq(
        "800773694390715667",
      )
      expect(await feeDistributor["claimable(address)"](users[10])).to.eq(
        "199226305609284332",
      )

      // After claiming the rewards, no more rewards are claimable
      await feeDistributor.connect(signers[10])["claim()"]()
      expect(await feeDistributor["claimable(address)"](users[10])).to.eq(0)
      expect(await lpToken.balanceOf(users[10])).to.eq("199226305609284332")
    })
  })
})
