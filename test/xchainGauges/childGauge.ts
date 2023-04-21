import chai from "chai"
import { Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
  ChildGauge,
  ChildGaugeFactory,
  ChildOracle,
  GenericERC20,
  MockAnyCall,
  RootGaugeFactory,
  RootOracle,
  SDL,
  VotingEscrow,
} from "../../build/typechain"
import { DAY, MAX_LOCK_TIME, WEEK } from "../../utils/time"
import {
  BIG_NUMBER_1E18,
  convertGaugeNameToSalt,
  getCurrentBlockTimestamp,
  impersonateAccount,
  increaseTimestamp,
  MAX_UINT256,
  setEtherBalance,
  setTimestamp,
  ZERO_ADDRESS,
} from "../testUtils"
import {
  setupAnyCallTranslator,
  setupChildGaugeFactory,
  setupChildOracle,
  setupRootGaugeFactory,
  setupRootOracle,
} from "./utils"
const { expect } = chai

describe("ChildGauge", () => {
  let signers: Array<Signer>
  let users: string[]
  let mockAnyCall: MockAnyCall
  let rootGaugeFactory: RootGaugeFactory
  let childGaugeFactory: ChildGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let veSDL: VotingEscrow
  let sdl: SDL
  let rootOracle: RootOracle
  let childOracle: ChildOracle
  let dummyToken: GenericERC20
  let dummyRewardToken: GenericERC20
  let dummyRewardToken2: GenericERC20
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
      sdl = await ethers.getContract("SDL")
      await sdl.enableTransfer()
      await sdl.approve(veSDL.address, MAX_UINT256)
      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        (await getCurrentBlockTimestamp()) + MAX_LOCK_TIME,
      )

      dummyToken = (await ethers
        .getContractFactory("GenericERC20")
        .then((f) => f.deploy("Dummy Token", "DUMMY", 18))) as GenericERC20
      await dummyToken.mint(users[0], BIG_NUMBER_1E18.mul(100_000))

      dummyRewardToken = (await ethers
        .getContractFactory("GenericERC20")
        .then((f) =>
          f.deploy("Dummy Reward Token", "DUMMYR", 18),
        )) as GenericERC20
      await dummyRewardToken.mint(users[0], BIG_NUMBER_1E18.mul(100_000))

      dummyRewardToken2 = (await ethers
        .getContractFactory("GenericERC20")
        .then((f) =>
          f.deploy("Dummy Reward Token", "DUMMYR", 18),
        )) as GenericERC20

      // **** Deploy a child gauge from the child gauge factory ****
      // Impersonate AnyCallTranslator calling ChildGaugeFactory
      // This is to ensure gauge_data is marked as mirrored
      const impersonatedAnyCallTranslator = await impersonateAccount(
        anyCallTranslator.address,
      )
      await setEtherBalance(anyCallTranslator.address, BIG_NUMBER_1E18.mul(10))
      await childGaugeFactory
        .connect(impersonatedAnyCallTranslator)
        ["deploy_gauge(address,bytes32,string,address)"](
          dummyToken.address,
          GAUGE_SALT,
          GAUGE_NAME,
          users[0],
        )
      childGauge = await ethers.getContractAt(
        "ChildGauge",
        await childGaugeFactory.get_gauge(0),
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("initialize", () => {
    it("Sets relevant storage variables on initialize", async () => {
      expect(await childGauge.lp_token()).to.eq(dummyToken.address)
      expect(await childGauge.manager()).to.eq(users[0])
      expect(await childGauge.voting_escrow()).to.eq(childOracle.address)
      expect(await childGauge.factory()).to.eq(childGaugeFactory.address)

      // ERC20 storage variables
      expect(await childGauge.symbol()).to.eq(
        (await dummyToken.symbol()) + "-gauge",
      )
      expect(await childGauge.name()).to.eq(
        "Saddle " + GAUGE_NAME + " Child Gauge",
      )
      expect(await childGauge.decimals()).to.eq(18)
      expect(await childGauge.totalSupply()).to.eq(0)
    })

    it("Reverts when it is already initialized", async () => {
      await expect(
        childGauge.initialize(dummyToken.address, users[0], GAUGE_NAME),
      ).to.be.reverted
    })
  })

  describe("add_reward", () => {
    it("Successfully adds a reward token", async () => {
      await childGauge.add_reward(dummyRewardToken.address, users[0])
      expect(await childGauge.reward_count()).to.eq(1)
      expect(await childGauge.reward_tokens(0)).to.eq(dummyRewardToken.address)
      const rewardData = await childGauge.reward_data(dummyRewardToken.address)

      expect(rewardData.rate).to.eq(0)
      expect(rewardData.distributor).to.eq(users[0])
    })

    it("Reverts when the reward token is already added", async () => {
      await childGauge.add_reward(dummyRewardToken.address, users[0])
      await expect(childGauge.add_reward(dummyRewardToken.address, users[0])).to
        .be.reverted
    })

    it("Reverts when distributor address is empty (zero address)", async () => {
      await expect(
        childGauge.add_reward(dummyRewardToken.address, ZERO_ADDRESS),
      ).to.be.reverted
    })

    it("Reverts when called by non-manager", async () => {
      await expect(
        childGauge
          .connect(signers[10])
          .add_reward(dummyRewardToken.address, users[10]),
      ).to.be.reverted
    })
  })

  describe("set_reward_distributor", () => {
    it("Successfully sets the reward distributor", async () => {
      await childGauge.add_reward(dummyRewardToken.address, users[0])
      await childGauge.set_reward_distributor(
        dummyRewardToken.address,
        users[1],
      )
      const rewardData = await childGauge.reward_data(dummyRewardToken.address)
      expect(rewardData.distributor).to.eq(users[1])
    })

    it("Reverts when the reward token is not added", async () => {
      await expect(
        childGauge.set_reward_distributor(dummyRewardToken.address, users[1]),
      ).to.be.reverted
    })

    it("Reverts when new distributor is zero", async () => {
      await childGauge.add_reward(dummyRewardToken.address, users[0])
      await expect(
        childGauge.set_reward_distributor(
          dummyRewardToken.address,
          ZERO_ADDRESS,
        ),
      ).to.be.reverted
    })

    it("Reverts when called by non-manager", async () => {
      await childGauge.add_reward(dummyRewardToken.address, users[0])
      await expect(
        childGauge
          .connect(signers[10])
          .set_reward_distributor(dummyRewardToken.address, users[10]),
      ).to.be.reverted
    })
  })

  describe("deposit_reward_token", () => {
    beforeEach(async () => {
      await childGauge.add_reward(dummyRewardToken.address, users[0])
      await dummyRewardToken.approve(childGauge.address, MAX_UINT256)
    })

    it(`Successfully deposits reward token`, async () => {
      await childGauge.deposit_reward_token(
        dummyRewardToken.address,
        BIG_NUMBER_1E18.mul(100),
      )
      expect(await dummyRewardToken.balanceOf(childGauge.address)).to.eq(
        BIG_NUMBER_1E18.mul(100),
      )
      const rewardData = await childGauge.reward_data(dummyRewardToken.address)

      // 100 tokens distributed over 1 week
      // 100 * 1e18 / 604800
      expect(rewardData.rate).to.eq("165343915343915")
    })

    it("Reverts when the reward token is not added", async () => {
      await expect(childGauge.deposit_reward_token(users[10], BIG_NUMBER_1E18))
        .to.be.reverted
    })

    it("Reverts when caller is not the distributor", async () => {
      await expect(
        childGauge
          .connect(signers[10])
          .deposit_reward_token(
            dummyRewardToken.address,
            BIG_NUMBER_1E18.mul(100),
          ),
      ).to.be.reverted
    })
  })

  describe("with veSDL deposits", () => {
    beforeEach(async () => {
      await childGauge.add_reward(dummyRewardToken.address, users[0])
      await dummyRewardToken.approve(childGauge.address, MAX_UINT256)
      await childGauge.deposit_reward_token(
        dummyRewardToken.address,
        BIG_NUMBER_1E18.mul(100),
      )

      // Give some SDL to signers[1]
      // Lock 5M SDL for full duration
      const sdl = (await ethers.getContract("SDL")) as GenericERC20
      await sdl.transfer(users[1], BIG_NUMBER_1E18.mul(5_000_000))
      await sdl.connect(signers[1]).approve(veSDL.address, MAX_UINT256)
      await veSDL
        .connect(signers[1])
        .create_lock(
          BIG_NUMBER_1E18.mul(5_000_000),
          (await getCurrentBlockTimestamp()) + MAX_LOCK_TIME,
        )

      // Give some staking token to signers[1]
      await dummyToken.transfer(users[1], BIG_NUMBER_1E18.mul(100))
      await dummyToken.approve(childGauge.address, MAX_UINT256)
      await dummyToken
        .connect(signers[1])
        .approve(childGauge.address, MAX_UINT256)

      // Push veSDL data to Child Oracle
      const userPointData0 = await veSDL.user_point_history(
        users[0],
        await veSDL.user_point_epoch(users[0]),
      )
      const userPointData1 = await veSDL.user_point_history(
        users[1],
        await veSDL.user_point_epoch(users[1]),
      )
      const globalData = await veSDL.point_history(await veSDL.epoch())
      const callProxyAddress = await childOracle.callProxy()
      const oracleOwner = await impersonateAccount(callProxyAddress)
      await setEtherBalance(callProxyAddress, BIG_NUMBER_1E18.mul(100))

      await childOracle
        .connect(oracleOwner)
        .receive(userPointData0, globalData, users[0])
      await childOracle
        .connect(oracleOwner)
        .receive(userPointData1, globalData, users[1])
    })

    describe("claim_rewards", () => {
      it("Successfully claims rewards", async () => {
        await childGauge
          .connect(signers[1])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await increaseTimestamp(DAY)

        // 100 tokens distributed over 1 week, 1 day passed
        // 100 * 1e18 / 7
        await expect(
          childGauge.connect(signers[1])["claim_rewards()"](),
        ).to.changeTokenBalance(
          dummyRewardToken,
          users[1],
          "14285879629629599900",
        )
      })
      it("Successfully claims rewards with an additional 0 rate reward token", async () => {
        // testing if a non-ERC20 contract is set as a reward token
        await childGauge.add_reward(users[1], users[1])

        await childGauge
          .connect(signers[1])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await increaseTimestamp(DAY)

        // 100 tokens distributed over 1 week, 1 day passed
        // 100 * 1e18 / 7
        await expect(
          childGauge.connect(signers[1])["claim_rewards()"](),
        ).to.changeTokenBalance(
          dummyRewardToken,
          users[1],
          "14285879629629599900",
        )
      })

      it("Successfully claims rewards to receiver if its set", async () => {
        await childGauge
          .connect(signers[1])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await childGauge.set_rewards_receiver(users[2])
        await increaseTimestamp(DAY)

        // 100 tokens distributed over 1 week, 1 day passed
        // 100 * 1e18 / 86400
        await expect(
          childGauge.connect(signers[1])["claim_rewards()"](),
        ).to.changeTokenBalance(
          dummyRewardToken,
          users[1],
          "14286044973544943800",
        )
      })

      it("Successfully claims rewards from different accounts", async () => {
        // signers[0] have more veSDL since they locked more SDL
        // We expect both accounts to receive the same amount of external rewards
        // since veSDL boosts only apply to SDL rewards
        await childGauge
          .connect(signers[0])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await childGauge
          .connect(signers[1])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))

        await increaseTimestamp(DAY)
        await expect(
          childGauge.connect(signers[0])["claim_rewards()"](),
        ).to.changeTokenBalance(
          dummyRewardToken,
          users[0],
          "7143105158730143800",
        )
        await expect(
          childGauge.connect(signers[1])["claim_rewards()"](),
        ).to.changeTokenBalance(
          dummyRewardToken,
          users[1],
          "7143022486772471800",
        )
      })
    })

    describe("ChildGaugeFactory.mint()", () => {
      beforeEach(async () => {
        await childGauge
          .connect(signers[0])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await childGauge
          .connect(signers[1])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await increaseTimestamp(DAY)

        // This is the first time a user is attempting to call mint.
        // In production, this will trigger transmit_emissions()
        // on RootGaugeFactory on Eth mainnet
        const tx = await childGaugeFactory
          .connect(signers[0])
          .mint(childGauge.address)
          .then((tx) => tx.wait())

        const anyCallEvent = tx.events?.find(
          (e) =>
            e.topics[0] ===
            mockAnyCall.interface.getEventTopic("AnyCallMessage"),
        )
        const logDescription = mockAnyCall.interface.parseLog(anyCallEvent!)

        // Check transmit_emissions() is correctly formatted via AnyCall
        const calldata = rootGaugeFactory.interface.encodeFunctionData(
          "transmit_emissions",
          [childGauge.address],
        )
        expect(logDescription.args.data).to.equal(
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [childGaugeFactory.address, calldata],
          ),
        )
        expect(logDescription.args.to).to.equal(anyCallTranslator.address)

        // Assume RootGaugeFactory.transmit_emissions() was called
        // and the SDL was transferred to the ChildGauge
        await sdl.transfer(childGauge.address, BIG_NUMBER_1E18.mul(1_000_000))
        // Trigger checkpoint call to make ChildGauge aware of the SDL
        // This will send SDL from the ChildGauge to ChildGaugeFactory
        await childGauge.connect(signers[0]).user_checkpoint(users[0])
        expect(
          await childGauge.inflation_rate(
            Math.floor((await getCurrentBlockTimestamp()) / WEEK),
          ),
        ).to.closeTo("1929105377381239450", 1e13)
      })

      it(`Mints correct amount of SDL to the stakers`, async () => {
        // We expect next mint() calls to be successful and actually transfer SDL to users

        const user0SdlBalanceBefore = await sdl.balanceOf(users[0])
        await expect(
          childGaugeFactory.connect(signers[0]).mint(childGauge.address),
        ).to.emit(childGaugeFactory, "Minted")
        const user0SdlBalanceAfter = await sdl.balanceOf(users[0])
        expect(user0SdlBalanceAfter.sub(user0SdlBalanceBefore)).to.closeTo(
          "1071725209656244100",
          1e13,
        )

        // We expect mint() call from signer[1] to transfer more SDL since they have more veSDL
        const user1SdlBalanceBefore = await sdl.balanceOf(users[1])
        await expect(
          childGaugeFactory.connect(signers[1]).mint(childGauge.address),
        ).to.emit(childGaugeFactory, "Minted")
        const user1SdlBalanceAfter = await sdl.balanceOf(users[1])
        expect(user1SdlBalanceAfter.sub(user1SdlBalanceBefore)).to.closeTo(
          "1714760335449990559",
          1e13,
        )
      })

      it(`Does not 'mint' to users who are not staking`, async () => {
        // We expect next mint() call from non-staker to not emit any Minted event
        await expect(
          childGaugeFactory.connect(signers[3]).mint(childGauge.address),
        )
          .to.changeTokenBalance(sdl, users[2], 0)
          .and.not.emit(childGaugeFactory, "Minted")
      })
    })

    describe("ChildGaugeFactory.mint() when bridge is unresponsive", () => {
      beforeEach(async () => {
        await childGauge
          .connect(signers[0])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await childGauge
          .connect(signers[1])
          ["deposit(uint256)"](BIG_NUMBER_1E18.mul(100))
        await increaseTimestamp(DAY)

        // This is the first time a user is attempting to call mint.
        // In production, this will trigger transmit_emissions()
        // on RootGaugeFactory on Eth mainnet
        await expect(
          childGaugeFactory.connect(signers[0]).mint(childGauge.address),
        ).to.emit(mockAnyCall, "AnyCallMessage")
        // Assume RootGaugeFactory.transmit_emissions() was NOT called due to
        // bridge failure. This will cause the SDL to not arrive at the child gauge
      })

      it(`Correctly mints when bridge is continued`, async () => {
        await expect(
          childGaugeFactory.connect(signers[0]).mint(childGauge.address),
        ).to.not.emit(childGaugeFactory, "Minted")
        await expect(
          childGaugeFactory.connect(signers[1]).mint(childGauge.address),
        ).to.not.emit(childGaugeFactory, "Minted")

        // One day passes and the bridge is fixed
        await increaseTimestamp(DAY)
        await sdl.transfer(childGauge.address, BIG_NUMBER_1E18.mul(1_000_000))
        await childGauge.connect(signers[0]).user_checkpoint(users[0])

        const user0SdlBalanceBefore = await sdl.balanceOf(users[0])
        await expect(
          childGaugeFactory.connect(signers[0]).mint(childGauge.address),
        ).to.emit(childGaugeFactory, "Minted")
        const user0SdlBalanceAfter = await sdl.balanceOf(users[0])
        expect(user0SdlBalanceAfter.sub(user0SdlBalanceBefore)).to.closeTo(
          "1286091588240801600",
          1e13,
        )

        const user1SdlBalanceBefore = await sdl.balanceOf(users[1])
        await expect(
          childGaugeFactory.connect(signers[1]).mint(childGauge.address),
        ).to.emit(childGaugeFactory, "Minted")
        const user1SdlBalanceAfter = await sdl.balanceOf(users[1])
        expect(user1SdlBalanceAfter.sub(user1SdlBalanceBefore)).to.closeTo(
          "2057746541185282559",
          1e13,
        )
      })
    })
  })
})
