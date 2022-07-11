import chai from "chai"
import { solidity } from "ethereum-waffle"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import {
  GaugeController,
  Minter,
  SDL,
  VotingEscrow,
  LPToken,
  Swap,
  LiquidityGaugeV5,
} from "../../build/typechain/"
import {
  asyncForEach,
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  increaseTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"

chai.use(solidity)
const { expect } = chai

const WEEK = 86400 * 7
const MAXTIME = 86400 * 365 * 4
const LOCK_START_TIMESTAMP = 2362003200

const USD_V2_SWAP_NAME = "SaddleUSDPoolV2"
const USD_V2_LP_TOKEN_NAME = `${USD_V2_SWAP_NAME}LPToken`
const USD_V2_GAUGE_NAME = `LiquidityGaugeV5_${USD_V2_LP_TOKEN_NAME}`

describe("Liquidity Gauge V5", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let deployerAddress: string
  let veSDL: VotingEscrow
  let sdl: SDL
  let minter: Minter
  let gaugeController: GaugeController
  let gauge: LiquidityGaugeV5
  let lpToken: LPToken

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )
      deployerAddress = users[0]
      minter = await ethers.getContract("Minter")

      const swap: Swap = await ethers.getContract(USD_V2_SWAP_NAME)
      lpToken = await ethers.getContract(USD_V2_LP_TOKEN_NAME)
      gauge = await ethers.getContract(USD_V2_GAUGE_NAME)
      gaugeController = await ethers.getContract("GaugeController")

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
      await lpToken.approve(gauge.address, MAX_UINT256)
      await lpToken.transfer(users[10], BIG_NUMBER_1E18)
      await lpToken.connect(signers[10]).approve(gauge.address, MAX_UINT256)

      sdl = await ethers.getContract("SDL")
      veSDL = await ethers.getContract("VotingEscrow")

      // Ensure test setup is correct
      if (await sdl.paused()) {
        await sdl.enableTransfer()
      }

      await sdl.approve(veSDL.address, MAX_UINT256)

      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        (await getCurrentBlockTimestamp()) + MAXTIME,
      )

      await sdl.transfer(minter.address, BIG_NUMBER_1E18.mul(1_000_000))
<<<<<<< HEAD
=======

      // Set timestamp to start of next week to ensure consistent test results
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
      if ((await minter.rate()).eq(MAX_UINT256)) {
        await minter.update_mining_parameters()
      }

      // Imitate multisig setting gauge weights
      await gaugeController.change_gauge_weight(gauge.address, 10000)

      // Skip to the week after when the weights apply
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
>>>>>>> d03757cddbc9710170a809933d414dfe740c4afc
    },
  )

  beforeEach(async () => {
    await setupTest()
<<<<<<< HEAD

    // Set timestamp to start of next week to ensure consistent test results
    await setTimestamp(
      Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
    )
    await minter.update_mining_parameters()

    // Imitate multisig setting gauge weights
    await gaugeController.change_gauge_weight(gauge.address, 10000)

    // Skip to the week after when the weights apply
    await setTimestamp(
      Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
    )
=======
>>>>>>> d03757cddbc9710170a809933d414dfe740c4afc
  })

  describe("deposit & claimable_tokens", () => {
    it(`ve balance correctly boosts the rewards`, async () => {
      // Deposit from 2 different accounts to ensure the rewards are boosted correctly

      // Deposit from an account with max boost
      // Expect working balance to be same as the deposit amount
      await gauge["deposit(uint256)"](BIG_NUMBER_1E18)
      expect(await gauge.balanceOf(deployerAddress)).to.eq(BIG_NUMBER_1E18)
      expect(await gauge.working_balances(deployerAddress)).to.eq(
        BIG_NUMBER_1E18,
      )

      // Deposit from an account with no boost
      // Expect working balance to be 40% of the deposit amount
      await gauge.connect(signers[10])["deposit(uint256)"](BIG_NUMBER_1E18)
      expect(await gauge.balanceOf(users[10])).to.eq(BIG_NUMBER_1E18)
      expect(await gauge.working_balances(users[10])).to.eq(String(0.4e18))

      // Expect total working supply to be less than total deposit amount
      expect(await gauge.working_supply()).to.eq(String(1.4e18))

      // A day passes
      await increaseTimestamp(86400)

      expect(await gauge.callStatic.claimable_tokens(deployerAddress)).to.eq(
<<<<<<< HEAD
        "25510617441421012800930",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "10204081632653061205028",
=======
        "127032254961761840554085",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "50812078640837870793172",
>>>>>>> d03757cddbc9710170a809933d414dfe740c4afc
      )

      // Gauge weight is changed mid-week but will apply next week
      await gaugeController.change_gauge_weight(gauge.address, 0)

      // Full week passes and we expect the rewards to have maxxed out
      await increaseTimestamp(86400 * 6)
      expect(await gauge.callStatic.claimable_tokens(deployerAddress)).to.eq(
<<<<<<< HEAD
        "178571251417233559750131",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "71428335222978079984708",
=======
        "889210494060519668778594",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "355683374280341002082976",
>>>>>>> d03757cddbc9710170a809933d414dfe740c4afc
      )

      // Expect no change in rewards
      await increaseTimestamp(86400)
      expect(await gauge.callStatic.claimable_tokens(deployerAddress)).to.eq(
<<<<<<< HEAD
        "178571251417233559750131",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "71428335222978079984708",
=======
        "889210494060519668778594",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "355683374280341002082976",
>>>>>>> d03757cddbc9710170a809933d414dfe740c4afc
      )

      // Claim main reward via calling Minter.mint()
      await minter.connect(signers[10]).mint(gauge.address)
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq("0")
<<<<<<< HEAD
      expect(await sdl.balanceOf(users[10])).to.eq("71428335222978079984708")
=======
      expect(await sdl.balanceOf(users[10])).to.eq("355683374280341002082976")
>>>>>>> d03757cddbc9710170a809933d414dfe740c4afc
    })
  })

  describe("withdraw", () => {
    it(`Successfully withdraws LP token`, async () => {
      // Deposit from 2 different accounts to ensure the rewards are boosted correctly

      // Deposit from an account with max boost
      // Expect working balance to be same as the deposit amount
      await gauge["deposit(uint256)"](BIG_NUMBER_1E18)
      await gauge.connect(signers[10])["deposit(uint256)"](BIG_NUMBER_1E18)

      // A day passes
      await increaseTimestamp(86400)

      expect(await gauge.callStatic.claimable_tokens(deployerAddress)).to.eq(
<<<<<<< HEAD
        "25510617441421012800930",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "10204081632653061205028",
=======
        "127032254961761840554085",
      )
      expect(await gauge.callStatic.claimable_tokens(users[10])).to.eq(
        "50812078640837870793172",
>>>>>>> d03757cddbc9710170a809933d414dfe740c4afc
      )

      // Withdraw LP tokens
      await gauge.connect(signers[10])["withdraw(uint256)"](BIG_NUMBER_1E18)

      expect(await lpToken.balanceOf(users[10])).to.eq(BIG_NUMBER_1E18)
      expect(await gauge.balanceOf(users[10])).to.eq(0)
    })
  })
})
