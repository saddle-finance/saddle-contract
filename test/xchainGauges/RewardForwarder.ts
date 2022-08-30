import chai from "chai"
import { solidity } from "ethereum-waffle"
import { ContractFactory, Signer } from "ethers"
import { deployments } from "hardhat"
import {
  ChildGaugeFactory,
  LPToken,
  RewardForwarder,
  AnyCallTranslator,
  ChildGauge,
  GenericERC20,
} from "../../build/typechain"

import { BIG_NUMBER_1E18 } from "../testUtils"
const { execute } = deployments

chai.use(solidity)
const { expect } = chai

describe("RewardForwarder", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let rewardForwarder: RewardForwarder
  let testToken: LPToken
  let firstGaugeToken: GenericERC20
  let lpTokenFactory: ContractFactory
  let childGaugeFactory: ChildGaugeFactory
  let anycallTranslator: AnyCallTranslator
  let childGauge: ChildGauge

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Deploy child gauge
      const childGaugeFactoryFactory = await ethers.getContractFactory(
        "ChildGaugeFactory",
      )

      childGaugeFactory = (await childGaugeFactoryFactory.deploy(
        ZERO_ADDRESS,
        (
          await ethers.getContract("SDL")
        ).address,
        users[0],
      )) as ChildGaugeFactory

      // Root Gauge Implementation
      const gaugeImplementationFactory = await ethers.getContractFactory(
        "ChildGauge",
      )
      childGauge = (await gaugeImplementationFactory.deploy(
        (
          await ethers.getContract("SDL")
        ).address,
        childGaugeFactory.address,
      )) as ChildGauge

      // Reward Forwarder Deployment
      // Root Gauge Implementation
      const rewardFowarderFactory = await ethers.getContractFactory(
        "RewardForwarder",
      )
      rewardForwarder = (await rewardFowarderFactory.deploy(
        childGauge.address,
      )) as RewardForwarder

      // Deploy dummy tokens
      lpTokenFactory = await ethers.getContractFactory("LPToken")
      const erc20Factory = await ethers.getContractFactory("GenericERC20")
      firstGaugeToken = (await erc20Factory.deploy(
        "First Gauge Token",
        "GFIRST",
        "18",
      )) as GenericERC20
      await firstGaugeToken.mint(users[0], BIG_NUMBER_1E18)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize RewardForwarder", () => {
    it(`Successfully initializes with gauge`, async () => {
      expect(await rewardForwarder.gauge()).to.eq(childGauge.address)
    })
  })
  describe("Successfully deposits in RewardForwarder", () => {
    it(`Successfully deposits lp token`, async () => {
      testToken = (await lpTokenFactory.deploy()) as LPToken
      testToken.initialize("Gauge Test Token", "GT")
      await testToken.mint(users[0], 100)
      //   TODO: Property 'deposit' does not exist on type 'ChildGauge', so have to use execute
      // following does not work await childGauge.deposit(100)
      // TODO: Execute cannot find the deployment
      // await execute(
      //   "ChildGauge",
      //   { from: users[0], log: true },
      //   "deposit(uint256)",
      //   100,
      // )
    })
    it(`Successfully adds reward`, async () => {
      const firstGaugeTokenAddr = firstGaugeToken.address
      const rewardForwarderAddr = rewardForwarder.address
      await childGauge.add_reward(firstGaugeTokenAddr, rewardForwarderAddr)
      await firstGaugeToken.transfer(rewardForwarderAddr, BIG_NUMBER_1E18)
      await rewardForwarder.allow(firstGaugeTokenAddr)
      await rewardForwarder
        .connect(user1)
        .depositRewardToken(firstGaugeTokenAddr)
      expect(await firstGaugeToken.balanceOf(childGauge.address)).to.be.eq(
        BIG_NUMBER_1E18,
      )
      expect(
        (await childGauge.reward_data(firstGaugeTokenAddr))["rate"],
      ).to.be.gt(0)
    })
    it(`Reverts deposit without allow`, async () => {
      const firstGaugeTokenAddr = firstGaugeToken.address
      const rewardForwarderAddr = rewardForwarder.address
      await childGauge.add_reward(firstGaugeTokenAddr, rewardForwarderAddr)
      await firstGaugeToken.transfer(rewardForwarderAddr, BIG_NUMBER_1E18)
      console.log("...")
      // rewardForwarder cannot deposit if allow(token) is not called
      await expect(
        rewardForwarder.depositRewardToken(firstGaugeTokenAddr),
      ).to.be.revertedWith("ERC20: transfer amount exceeds allowance")
    })
    it(`Reverts if reward token is not added to gauge`, async () => {
      const firstGaugeTokenAddr = firstGaugeToken.address
      const rewardForwarderAddr = rewardForwarder.address
      await firstGaugeToken.transfer(rewardForwarderAddr, BIG_NUMBER_1E18)
      await rewardForwarder.allow(firstGaugeTokenAddr)
      // token cannot be deposited without being added as a reward first
      await expect(
        rewardForwarder.connect(user1).depositRewardToken(firstGaugeTokenAddr),
      ).to.be.reverted
    })
    // TODO: add test for claiming rewards
  })
})
