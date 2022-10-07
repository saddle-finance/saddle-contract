import chai from "chai"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  ChildGauge,
  ChildGaugeFactory,
  ChildOracle,
  GenericERC20,
  MockAnyCall,
  RewardForwarder,
  RootGaugeFactory,
  RootOracle,
  SDL,
  VotingEscrow,
} from "../../build/typechain"
import { MAX_LOCK_TIME, WEEK } from "../../utils/time"

import {
  BIG_NUMBER_1E18,
  convertGaugeNameToSalt,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"
import {
  setupAnyCallTranslator,
  setupChildGaugeFactory,
  setupChildOracle,
  setupRootGaugeFactory,
  setupRootOracle,
} from "./utils"
const { execute } = deployments

const { expect } = chai

describe("RewardForwarder", () => {
  let signers: Array<Signer>
  let users: string[]
  let mockAnyCall: MockAnyCall
  let rootGaugeFactory: RootGaugeFactory
  let childGaugeFactory: ChildGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let veSDL: VotingEscrow
  let rootOracle: RootOracle
  let childOracle: ChildOracle
  let dummyToken: GenericERC20
  let dummyRewardToken: GenericERC20
  let rewardForwarder: RewardForwarder
  let childGauge: ChildGauge

  const GAUGE_NAME = "Dummy Token X-chain Gauge"
  const GAUGE_SALT = convertGaugeNameToSalt(GAUGE_NAME)

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      const contracts = await setupAnyCallTranslator(users[0])
      anyCallTranslator = contracts.anyCallTranslator
      mockAnyCall = contracts.mockAnyCall

      // **** Setup rootGauge Factory ****

      rootGaugeFactory = await setupRootGaugeFactory(
        anyCallTranslator.address,
        users[0],
      )

      // **** Setup RootOracle ****
      rootOracle = await setupRootOracle(
        anyCallTranslator.address,
        rootGaugeFactory.address,
      )

      // **** Setup ChildOracle ****
      childOracle = await setupChildOracle(anyCallTranslator.address)

      // **** Setup ChildGaugeFactory ****
      childGaugeFactory = await setupChildGaugeFactory(
        anyCallTranslator.address,
        users[0],
        childOracle.address,
      )

      // **** Add expected callers to known callers ****
      await anyCallTranslator.addKnownCallers([
        rootGaugeFactory.address,
        rootOracle.address,
        childGaugeFactory.address,
      ])

      // Set timestamp to start of the week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )

      // Create max lock from deployer address
      veSDL = await ethers.getContract("VotingEscrow")
      await ethers
        .getContract("SDL")
        .then((sdl) => (sdl as SDL).approve(veSDL.address, MAX_UINT256))
      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        (await getCurrentBlockTimestamp()) + MAX_LOCK_TIME,
      )

      // Deploy dummy token to be used as staking token for test gauge
      dummyToken = (await ethers
        .getContractFactory("GenericERC20")
        .then((f) => f.deploy("Dummy Token", "DUMMY", 18))) as GenericERC20
      await dummyToken.mint(users[0], BIG_NUMBER_1E18.mul(100_000))

      // Deploy dummy token to be used as reward token
      dummyRewardToken = (await ethers
        .getContractFactory("GenericERC20")
        .then((f) =>
          f.deploy("Dummy Reward Token", "DUMMYR", 18),
        )) as GenericERC20
      await dummyRewardToken.mint(users[0], BIG_NUMBER_1E18.mul(100_000))

      // **** Deploy a child gauge from the child gauge factory ****
      await childGaugeFactory["deploy_gauge(address,bytes32,string)"](
        dummyToken.address,
        GAUGE_SALT,
        GAUGE_NAME,
      )
      childGauge = await ethers.getContractAt(
        "ChildGauge",
        await childGaugeFactory.get_gauge(0),
      )

      // **** Deploy RewardForwarder ****
      rewardForwarder = (await ethers
        .getContractFactory("RewardForwarder")
        .then((f) => f.deploy(childGauge.address))) as RewardForwarder
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("gauge", () => {
    it(`Successfully initializes with gauge address`, async () => {
      const storedGaugeAddress = await rewardForwarder.gauge()
      expect(storedGaugeAddress).to.eq(childGauge.address)
      expect(storedGaugeAddress).to.eq(await childGaugeFactory.get_gauge(0))
    })
  })

  describe("allow", () => {
    it(`Successfully sets allowance to max`, async () => {
      await rewardForwarder.allow(dummyRewardToken.address)
      expect(
        await dummyRewardToken.allowance(
          rewardForwarder.address,
          childGauge.address,
        ),
      ).to.eq(MAX_UINT256)
    })
  })

  describe("depositRewardToken", () => {
    it(`Successfully deposits lp token`, async () => {
      await childGauge.add_reward(
        dummyRewardToken.address,
        rewardForwarder.address,
      )
      await rewardForwarder.allow(dummyRewardToken.address)
      await dummyRewardToken.transfer(
        rewardForwarder.address,
        BIG_NUMBER_1E18.mul(10_000),
      )
      // Then call depositRewardToken to deposit the tokens to the associated gauge
      await rewardForwarder.depositRewardToken(dummyRewardToken.address)

      expect(await dummyRewardToken.balanceOf(childGauge.address)).to.be.eq(
        BIG_NUMBER_1E18.mul(10_000),
      )
      expect(
        (await childGauge.reward_data(dummyRewardToken.address))["rate"],
      ).to.be.gt(0)
    })

    it(`Reverts when allow() is not called previously`, async () => {
      await childGauge.add_reward(
        dummyRewardToken.address,
        rewardForwarder.address,
      )
      await dummyRewardToken.transfer(
        rewardForwarder.address,
        BIG_NUMBER_1E18.mul(10_000),
      )
      await expect(
        rewardForwarder.depositRewardToken(dummyRewardToken.address),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
    })

    it(`Reverts when ChildGauge does not have matching reward token added`, async () => {
      await rewardForwarder.allow(childGauge.address)
      await dummyRewardToken.transfer(
        rewardForwarder.address,
        BIG_NUMBER_1E18.mul(10_000),
      )
      await expect(rewardForwarder.depositRewardToken(dummyRewardToken.address))
        .to.be.reverted
    })
  })
})
