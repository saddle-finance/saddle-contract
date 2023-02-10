import chai from "chai"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import {
  GaugeController,
  Minter,
  SDL,
  VotingEscrow,
  GenericERC20,
  RootGaugeLocal,
  RewardsOnlyGauge,
  ChildChainStreamer,
} from "../../build/typechain/"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"

const { expect } = chai

const DAY = 86400
const WEEK = DAY * 7
const MAXTIME = DAY * 365 * 4
const LOCK_START_TIMESTAMP = 2362003200

const DUMMY_LP_TOKEN_NAME = "DUMMY_CHILD_CHAIN_LP_TOKEN"
const REWARDS_ONLY_GAUGE_NAME = "RewardsOnlyGauge"
const ROOT_GAUGE_LOCAL_NAME = "RootGaugeLocal"
const GAUGE_CONTROLLER_NAME = "GaugeController"
const CHILD_CHAIN_STRAMER_NAME = "ChildChainStreamer"

describe("Root Gauge (Local)", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let veSDL: VotingEscrow
  let sdl: SDL
  let minter: Minter
  let gaugeController: GaugeController
  let rootGauge: RootGaugeLocal

  // side chain contracts
  let childChainStreamer: ChildChainStreamer
  let rewardsOnlyGauge: RewardsOnlyGauge
  let dummyLpToken: GenericERC20
  let rewardTokens: string[] = []

  const MAX_REWARDS = 8

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL", "RootGaugeLocal"], {
        fallbackToGlobal: false,
      }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )
      deployer = signers[0]
      minter = await ethers.getContract("Minter")
      dummyLpToken = await ethers.getContract(DUMMY_LP_TOKEN_NAME)
      rootGauge = await ethers.getContract(ROOT_GAUGE_LOCAL_NAME)
      childChainStreamer = await ethers.getContract(CHILD_CHAIN_STRAMER_NAME)
      rewardsOnlyGauge = await ethers.getContract(REWARDS_ONLY_GAUGE_NAME)
      gaugeController = await ethers.getContract(GAUGE_CONTROLLER_NAME)
      sdl = await ethers.getContract("SDL")
      veSDL = await ethers.getContract("VotingEscrow")

      // Add the root gauge to gauge controller
      await gaugeController["add_type(string,uint256)"](
        "Root Gauge",
        BIG_NUMBER_1E18,
      )
      await gaugeController["add_gauge(address,int128)"](rootGauge.address, 0)

      // Enable transfer if it isnt already
      if (await sdl.paused()) {
        await sdl.enableTransfer()
      }

      // Approve SDL and lock 10M for MAXTIME
      await sdl.approve(veSDL.address, MAX_UINT256)
      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        (await getCurrentBlockTimestamp()) + MAXTIME,
      )

      // Transfer 10M SDL to Minter
      await sdl.transfer(minter.address, BIG_NUMBER_1E18.mul(10_000_000))

      // SIDE CHAIN TXs
      // Minter dummy tokens to be used as the token to stake in RewardsOnlyGauge
      await dummyLpToken.mint(users[0], BIG_NUMBER_1E18)
      await dummyLpToken.mint(users[10], BIG_NUMBER_1E18)
      await dummyLpToken.approve(rewardsOnlyGauge.address, MAX_UINT256)
      await dummyLpToken
        .connect(signers[10])
        .approve(rewardsOnlyGauge.address, MAX_UINT256)

      rewardTokens = []
      for (let i = 0; i < MAX_REWARDS; i++) {
        try {
          rewardTokens.push(await rewardsOnlyGauge.reward_tokens(i))
        } catch {
          break
        }
      }

      // Set timestamp to start of next week to ensure consistent results
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )

      // If rate is not initialized, initialize it
      await rootGauge.connect(deployer).checkpoint()

      // Imitate multisig setting gauge weights
      await gaugeController.change_gauge_weight(rootGauge.address, 10000)

      // Skip to the week after when the weights apply
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
      await rootGauge.connect(deployer).checkpoint()
      console.log(
        `inflation rate: ${await rootGauge.inflation_rate()}\n` +
          `emissions: ${await rootGauge.emissions()}\n` +
          `period: ${await rootGauge.period()}`,
      )
      expect(await sdl.balanceOf(childChainStreamer.address)).to.be.eq(0)

      // For root gauges, we need to wait until the full duration of the rewards has passed
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )

      // Imitate multisig calling checkpoint
      // On mainnet this will trigger the bridging of SDL to other networks
      await rootGauge.connect(deployer).checkpoint()
      console.log(
        `inflation rate: ${await rootGauge.inflation_rate()}\n` +
          `emissions: ${await rootGauge.emissions()}\n` +
          `period: ${await rootGauge.period()}`,
      )

      // Simulate 1hr of briding delay
      await setTimestamp((await getCurrentBlockTimestamp()) + 60 * 60)

      // Child chain streamer should have the tokens now
      const childChainBalance = await sdl.balanceOf(childChainStreamer.address)
      expect(childChainBalance).to.eq("1249999999999999999430400")

      // Call notify reward_amount on the child chain streamer to let it know
      // SDL has been successfully bridged
      await childChainStreamer.notify_reward_amount(sdl.address)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("deposit & claimable_reward", () => {
    it(`Rewards are emitted equally among stakers`, async () => {
      // Deposit from 2 different accounts to ensure the rewards are boosted correctly

      // Deposit from an account with max boost
      // Since the boost is from mainnet, we expect no different treatment on side-chains
      await rewardsOnlyGauge["deposit(uint256)"](BIG_NUMBER_1E18)
      expect(await rewardsOnlyGauge.balanceOf(users[0])).to.eq(BIG_NUMBER_1E18)

      // Deposit from an account with no boost
      // Since the boost is from mainnet, we expect no different treatment on side-chains
      await rewardsOnlyGauge
        .connect(signers[10])
        ["deposit(uint256)"](BIG_NUMBER_1E18)

      // Check balance of works as expected
      expect(await rewardsOnlyGauge.balanceOf(users[0])).to.eq(BIG_NUMBER_1E18)
      expect(await rewardsOnlyGauge.balanceOf(users[10])).to.eq(BIG_NUMBER_1E18)

      // Expect total supply to be equal to sum of all deposits
      expect(await rewardsOnlyGauge.totalSupply()).to.eq(BIG_NUMBER_1E18.mul(2))

      // A day passes
      await setTimestamp((await getCurrentBlockTimestamp()) + DAY)

      // user[0] deposited before user[10] so he gets slightly more reward
      expect(
        await rewardsOnlyGauge.callStatic.claimable_reward_write(
          users[0],
          rewardTokens[0],
        ),
      ).to.eq("89289847883597883557196")

      expect(
        await rewardsOnlyGauge.callStatic.claimable_reward_write(
          users[10],
          rewardTokens[0],
        ),
      ).to.eq("89285714285714285673600")

      // Claim main reward via calling rewardsOnlyGauge.claim_rewards()
      await rewardsOnlyGauge.connect(signers[10])["claim_rewards()"]()
      expect(await sdl.balanceOf(users[10])).to.eq("89286747685185185144499")

      const beforeBalance = await sdl.balanceOf(users[0])
      await rewardsOnlyGauge.connect(signers[0])["claim_rewards()"]()
      expect((await sdl.balanceOf(users[0])).sub(beforeBalance)).to.eq(
        "89290881283068783028095",
      )
    })
  })

  describe("withdraw", () => {
    it(`Successfully withdraws LP token`, async () => {
      // User deposits some LP token
      await rewardsOnlyGauge
        .connect(signers[10])
        ["deposit(uint256)"](BIG_NUMBER_1E18)

      // A day passes
      await setTimestamp((await getCurrentBlockTimestamp()) + DAY)

      expect(
        await rewardsOnlyGauge.callStatic.claimable_reward_write(
          users[10],
          rewardTokens[0],
        ),
      ).to.eq("178573495370370370288998")

      // Withdraw LP tokens
      await rewardsOnlyGauge
        .connect(signers[10])
        ["withdraw(uint256)"](BIG_NUMBER_1E18)

      expect(await dummyLpToken.balanceOf(users[10])).to.eq(BIG_NUMBER_1E18)
      expect(await rewardsOnlyGauge.balanceOf(users[10])).to.eq(0)
    })
  })

  describe("name", () => {
    it(`RewardsOnlyGauge returns the name of the gauge`, async () => {
      const expectedName = "Saddle DUMMY_LP RewardGauge Deposit"
      expect(await rewardsOnlyGauge.name()).to.eq(expectedName)
    })

    it(`RootGaugeLocal returns the name of the gauge`, async () => {
      const expectedName = "Saddle DUMMY_LP Root Gauge (Local)"
      expect(await rootGauge.name()).to.eq(expectedName)
    })
  })

  describe("childChainStreamer", () => {
    beforeEach(async () => {
      // Increase time stamp by 12 hours, to be well into the current period
      await setTimestamp((await getCurrentBlockTimestamp()) + DAY / 2)

      console.log(
        `'Rewards received' before: ${
          (await childChainStreamer.reward_data(sdl.address))[4]
        }\n` +
          `'Last update time' before: ${await childChainStreamer.last_update_time()}`,
      )
    })

    afterEach(async () => {
      console.log(
        `'Rewards received' after: ${
          (await childChainStreamer.reward_data(sdl.address))[4]
        }\n` +
          `'Last update time' after: ${await childChainStreamer.last_update_time()}\n\n`,
      )
    })

    it(`Reverts when notified and no new rewards were deposited`, async () => {
      // Call notify_reward_amount from distributor within active period
      await expect(
        childChainStreamer
          .connect(signers[10])
          .notify_reward_amount(sdl.address),
      ).to.be.revertedWith("Invalid token or no new reward")
    })

    it(`Reverts when notified by non-distributor within active period`, async () => {
      // Simulate new SDL rewards coming from RootGauge
      await sdl.transfer(
        childChainStreamer.address,
        BIG_NUMBER_1E18.mul(500_000),
      )

      // Call notify_reward_amount from non-distributor within active period
      await expect(
        childChainStreamer
          .connect(signers[10])
          .notify_reward_amount(sdl.address),
      ).to.be.revertedWith("Reward period still active")
    })

    it(`Succeeds when notified by distributor within active period`, async () => {
      const lastUpdateTime = await childChainStreamer.last_update_time()
      const rewardsReceived = (
        await childChainStreamer.reward_data(sdl.address)
      )[4]

      // Simulate new SDL rewards coming from RootGauge
      await sdl.transfer(
        childChainStreamer.address,
        BIG_NUMBER_1E18.mul(500_000),
      )

      // Call notify_reward_amount from distributor (deployer)
      await childChainStreamer
        .connect(deployer)
        .notify_reward_amount(sdl.address)

      expect(await childChainStreamer.last_update_time()).to.be.gt(
        lastUpdateTime,
      )
      expect((await childChainStreamer.reward_data(sdl.address))[4]).to.be.eq(
        rewardsReceived.add(BIG_NUMBER_1E18.mul(500_000)),
      )
    })

    it(`Succeeds when notified by non-distributor after period ended`, async () => {
      const lastUpdateTime = await childChainStreamer.last_update_time()
      const rewardsReceived = (
        await childChainStreamer.reward_data(sdl.address)
      )[4]

      // Increase time stamp by 1 week, so active period is over
      await setTimestamp((await getCurrentBlockTimestamp()) + WEEK)

      // Simulate new SDL rewards coming from RootGauge
      await sdl.transfer(
        childChainStreamer.address,
        BIG_NUMBER_1E18.mul(500_000),
      )

      // Call notify_reward_amount from non-distributor outside active period
      await childChainStreamer
        .connect(signers[10])
        .notify_reward_amount(sdl.address)

      expect(await childChainStreamer.last_update_time()).to.be.gt(
        lastUpdateTime,
      )
      expect((await childChainStreamer.reward_data(sdl.address))[4]).to.be.eq(
        rewardsReceived.add(BIG_NUMBER_1E18.mul(500_000)),
      )
    })
  })
})
