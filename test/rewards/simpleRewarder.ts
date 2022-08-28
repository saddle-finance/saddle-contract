import chai from "chai"
import { solidity } from "ethereum-waffle"
import { BigNumber, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  GenericERC20,
  LPToken,
  MiniChefV2,
  SimpleRewarder,
  Swap,
} from "../../build/typechain/"
import {
  BIG_NUMBER_1E18,
  BIG_NUMBER_ZERO,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
  ZERO_ADDRESS,
} from "../testUtils"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

describe("SimpleRewarder", async () => {
  let signers: Array<Signer>
  let deployer: Signer
  let farmer: Signer
  let lazyFarmer: Signer
  let miniChef: MiniChefV2
  let swapContract: Swap
  let simpleRewarder: SimpleRewarder
  let usdv2LpToken: LPToken
  let rewardToken1: GenericERC20
  let rewardToken2: GenericERC20
  let deployerAddress: string
  let farmerAddress: string
  let lazyFarmerAddress: string

  // fixed time for testing
  const TEST_START_TIMESTAMP = 2362003200

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["USDPoolV2"], {
        fallbackToGlobal: false,
      })
      await setTimestamp(TEST_START_TIMESTAMP)

      signers = await ethers.getSigners()
      deployer = signers[0]
      farmer = signers[10]
      lazyFarmer = signers[11]
      deployerAddress = await deployer.getAddress()
      farmerAddress = await farmer.getAddress()
      lazyFarmerAddress = await lazyFarmer.getAddress()
      const genericERC20Factory = await ethers.getContractFactory(
        "GenericERC20",
      )
      const miniChefFactory = await ethers.getContractFactory("MiniChefV2")
      const simpleRewarderFactory = await ethers.getContractFactory(
        "SimpleRewarder",
      )

      swapContract = await ethers.getContract("SaddleUSDPoolV2")
      const tokens: GenericERC20[] = [
        await ethers.getContract("DAI"),
        await ethers.getContract("USDC"),
        await ethers.getContract("USDT"),
      ]
      for (const token of tokens) {
        await token.mint(
          farmerAddress,
          BigNumber.from(10)
            .pow(await token.decimals())
            .mul(2),
        )
        await token.connect(farmer).approve(swapContract.address, MAX_UINT256)
      }
      await swapContract
        .connect(farmer)
        .addLiquidity([BIG_NUMBER_1E18.mul(2), 2e6, 2e6], 0, MAX_UINT256)
      usdv2LpToken = await ethers.getContract("SaddleUSDPoolV2LPToken")

      rewardToken1 = (await genericERC20Factory.deploy(
        "Reward Token 1",
        "REWARD-1",
        18,
      )) as GenericERC20
      await rewardToken1.mint(deployerAddress, BIG_NUMBER_1E18.mul(1_000_000))

      rewardToken2 = (await genericERC20Factory.deploy(
        "Reward Token 2",
        "REWARD-2",
        18,
      )) as GenericERC20
      await rewardToken2.mint(deployerAddress, BIG_NUMBER_1E18.mul(1_000_000))

      miniChef = (await miniChefFactory.deploy(
        rewardToken1.address,
      )) as MiniChefV2

      // Add lpToken to minichef and sets main reward token's emision
      await miniChef.setSaddlePerSecond(BIG_NUMBER_1E18)
      await miniChef.add(1, usdv2LpToken.address, ZERO_ADDRESS)
      expect(await miniChef.poolLength()).to.eq(1)
      await rewardToken1.transfer(miniChef.address, BIG_NUMBER_1E18.mul(10000))

      // Deposits some LP token to existing minichef contract
      await usdv2LpToken.connect(farmer).approve(miniChef.address, MAX_UINT256)
      await miniChef.connect(farmer).deposit(0, BIG_NUMBER_1E18, farmerAddress)

      simpleRewarder = (await simpleRewarderFactory.deploy(
        miniChef.address,
      )) as SimpleRewarder
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  async function initializeRewarder() {
    // (IERC20 rewardToken, address owner, uint256 rewardPerSecond, IERC20 masterLpToken, uint256 pid)
    const data = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256", "address", "uint256"],
      [
        rewardToken2.address,
        deployerAddress,
        BIG_NUMBER_1E18.mul(2),
        usdv2LpToken.address,
        0,
      ],
    )
    await simpleRewarder.init(data)
    await rewardToken2.transfer(
      simpleRewarder.address,
      BIG_NUMBER_1E18.mul(100000),
    )
  }

  describe("init", () => {
    it("Reverts when given masterLpToken does not match", async () => {
      const data = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "address", "uint256"],
        [rewardToken2.address, deployerAddress, 200, rewardToken1.address, 0],
      )
      await expect(simpleRewarder.init(data)).to.be.revertedWith(
        "Rewarder: bad pid or masterLpToken",
      )
    })

    it("Reverts when already initialized", async () => {
      const data = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "address", "uint256"],
        [
          rewardToken2.address,
          deployerAddress,
          BIG_NUMBER_1E18.mul(2),
          usdv2LpToken.address,
          0,
        ],
      )
      await simpleRewarder.init(data)
      await expect(simpleRewarder.init(data)).to.be.revertedWith(
        "Rewarder: already initialized",
      )
    })

    it("Reverts when using bad rewardToken address", async () => {
      const data = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "address", "uint256"],
        [ZERO_ADDRESS, deployerAddress, 200, rewardToken1.address, 0],
      )
      await expect(simpleRewarder.init(data)).to.be.revertedWith(
        "Rewarder: bad rewardToken",
      )
    })

    it("Successfully calls init", async () => {
      const adminAddress = await signers[10].getAddress()
      const data = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "address", "uint256"],
        [
          rewardToken2.address,
          adminAddress,
          BIG_NUMBER_1E18.mul(2),
          usdv2LpToken.address,
          0,
        ],
      )
      await simpleRewarder.init(data)
      expect(await simpleRewarder.rewardToken()).to.eq(rewardToken2.address)
      expect(await simpleRewarder.masterLpToken()).to.eq(usdv2LpToken.address)
      expect(await simpleRewarder.rewardPerSecond()).to.eq(
        BIG_NUMBER_1E18.mul(2),
      )
      expect(await simpleRewarder.owner()).to.eq(adminAddress)
    })
  })

  describe("onSaddleReward", () => {
    beforeEach(async () => {
      await initializeRewarder()
    })

    it("Successfully calls on harvest", async () => {
      // Set rewarder of pid 0 to the SimpleRewarder contract
      await miniChef.set(0, 1, simpleRewarder.address, true)
      // Try harvesting. We expect farmer to receive little bit of rewardToken1 and 0 rewardToken2
      await miniChef.connect(farmer).harvest(0, farmerAddress)
      expect(
        (await rewardToken1.balanceOf(farmerAddress))
          .div(BIG_NUMBER_1E18)
          .toNumber(),
      ).to.eq(5)
      expect(
        (await rewardToken2.balanceOf(farmerAddress))
          .div(BIG_NUMBER_1E18)
          .toNumber(),
      ).to.eq(0)

      // Skip ahead 1000 seconds. We expect farmer to have about 1000e18 rewardToken1 and 2000e18 rewardToken2
      await setTimestamp((await getCurrentBlockTimestamp()) + 1000)
      await miniChef.connect(farmer).harvest(0, farmerAddress)
      expect(await rewardToken1.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(1006),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(2002),
      )
    })
  })

  describe("deposit", () => {
    beforeEach(async () => {
      await initializeRewarder()
    })

    it("Successfully deposits more after the rewarder is set", async () => {
      // Set rewarder of pid 0 to the SimpleRewarder contract
      await miniChef.set(0, 1, simpleRewarder.address, true)
      // Try harvesting. We expect farmer to receive little bit of rewardToken1 and 0 rewardToken2
      await miniChef.connect(farmer).harvest(0, farmerAddress)
      expect(await rewardToken1.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(BIG_NUMBER_ZERO)

      // Skip ahead 1000 seconds. We expect farmer to have about 1000e18 rewardToken1 and 2000e18 rewardToken2
      await setTimestamp((await getCurrentBlockTimestamp()) + 1000)
      await miniChef.connect(farmer).deposit(0, BIG_NUMBER_1E18, farmerAddress)
      expect(await rewardToken1.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(2002),
      )
      expect(
        (await miniChef.connect(farmer).userInfo(0, farmerAddress))[0],
      ).to.eq(BIG_NUMBER_1E18.mul(2))
    })
  })

  describe("setRewardPerSecond", () => {
    beforeEach(async () => {
      await initializeRewarder()
    })

    it("Succesfully updates rewardPerSecond variable", async () => {
      // rewardPerSecond was already set via init call
      expect(await simpleRewarder.rewardPerSecond()).to.eq(
        BIG_NUMBER_1E18.mul(2),
      )
      // Try updating it manually
      await simpleRewarder.setRewardPerSecond(BIG_NUMBER_1E18)
      // Confirm it was successful
      expect(await simpleRewarder.rewardPerSecond()).to.eq(BIG_NUMBER_1E18)
    })

    it("Reverts when called by non-owner", async () => {
      await expect(
        simpleRewarder.connect(farmer).setRewardPerSecond(0),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("pendingToken & pendingTokens", () => {
    beforeEach(async () => {
      // Lazy farmer deposits before we set rewarder and never claims
      await miniChef
        .connect(farmer)
        .deposit(0, BIG_NUMBER_1E18, lazyFarmerAddress)

      await initializeRewarder()

      // Set rewarder of pid 0 to the SimpleRewarder contract
      // From this point, users must call harvest, deposit, or withdraw to trigger
      // the rewarder to count their tokens.
      await miniChef.set(0, 1, simpleRewarder.address, true)

      await miniChef.connect(farmer).harvest(0, farmerAddress)
      await setTimestamp((await getCurrentBlockTimestamp()) + 1000)
    })

    it("Successfully reads pendingToken", async () => {
      // Farmer who called harvest after rewarder was set should have pendingToken > 0
      expect(await simpleRewarder.callStatic.pendingToken(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(1000),
      )
      expect(await miniChef.callStatic.pendingSaddle(0, farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(500),
      )
      // Lazy Farmer does not get any rewardToken2 until he triggers harvest
      // But he still gets some rewardToken1
      expect(
        await simpleRewarder.callStatic.pendingToken(lazyFarmerAddress),
      ).to.eq(0)
      expect(
        await miniChef.callStatic.pendingSaddle(0, lazyFarmerAddress),
      ).to.eq(BIG_NUMBER_1E18.mul(502))
    })

    it("Successfully reads pendingTokens", async () => {
      expect(
        await simpleRewarder.callStatic.pendingTokens(0, farmerAddress, 0),
      ).to.eql([[rewardToken2.address], [BIG_NUMBER_1E18.mul(1000)]])

      expect(
        await simpleRewarder.callStatic.pendingTokens(0, lazyFarmerAddress, 0),
      ).to.eql([[rewardToken2.address], [BIG_NUMBER_ZERO]])
    })
  })

  describe("withdraw", () => {
    it("Successfully withdraws and only harvests rewardToken2", async () => {
      await initializeRewarder()

      // Set rewarder of pid 0 to the SimpleRewarder contract
      // From this point, users must call harvest, deposit, or withdraw to trigger
      // the rewarder to count their tokens.
      await miniChef.set(0, 1, simpleRewarder.address, true)

      await miniChef.connect(farmer).harvest(0, farmerAddress)
      await setTimestamp((await getCurrentBlockTimestamp()) + 1000)

      expect(await usdv2LpToken.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken1.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(0)
      await miniChef.connect(farmer).withdraw(0, BIG_NUMBER_1E18, farmerAddress)
      expect(await usdv2LpToken.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(6),
      )
      expect(await rewardToken1.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(2002),
      )
    })
  })

  describe("withdrawAndHarvest", () => {
    it("Successfully withdraws and harvests reward tokens", async () => {
      await initializeRewarder()

      // Set rewarder of pid 0 to the SimpleRewarder contract
      // From this point, users must call harvest, deposit, or withdraw to trigger
      // the rewarder to count their tokens.
      await miniChef.set(0, 1, simpleRewarder.address, true)

      await miniChef.connect(farmer).harvest(0, farmerAddress)
      await setTimestamp((await getCurrentBlockTimestamp()) + 1000)

      expect(await usdv2LpToken.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken1.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(0)
      await miniChef
        .connect(farmer)
        .withdrawAndHarvest(0, BIG_NUMBER_1E18, farmerAddress)
      expect(await usdv2LpToken.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(6),
      )
      expect(await rewardToken1.balanceOf(farmerAddress)).to.satisfy(
        (balance: BigNumber) =>
          balance.eq(BIG_NUMBER_1E18.mul(1006)) ||
          balance.eq(BIG_NUMBER_1E18.mul(1007)),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(2002),
      )
    })
  })

  describe("emergencyWithdraw", () => {
    beforeEach(async () => {
      await initializeRewarder()

      // Set rewarder of pid 0 to the SimpleRewarder contract
      // From this point, users must call harvest, deposit, or withdraw to trigger
      // the rewarder to count their tokens.
      await miniChef.set(0, 1, simpleRewarder.address, true)

      await miniChef.connect(farmer).harvest(0, farmerAddress)
      await setTimestamp((await getCurrentBlockTimestamp()) + 1000)
    })

    it("Successfully calls emergencyWithdraw", async () => {
      expect(await usdv2LpToken.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(5),
      )
      expect(await rewardToken1.balanceOf(farmerAddress)).to.satisfy(
        (balance: BigNumber) =>
          balance.eq(BIG_NUMBER_1E18.mul(5)) ||
          balance.eq(BIG_NUMBER_1E18.mul(6)),
      )
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(0)
      await miniChef.connect(farmer).emergencyWithdraw(0, farmerAddress)
      expect(await usdv2LpToken.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(6),
      )
      expect(await rewardToken1.balanceOf(farmerAddress)).to.satisfy(
        (balance: BigNumber) =>
          balance.eq(BIG_NUMBER_1E18.mul(5)) ||
          balance.eq(BIG_NUMBER_1E18.mul(6)),
      )
      // Emergency withdraw does not withdraw rewardToken2
      expect(await rewardToken2.balanceOf(farmerAddress)).to.eq(
        BIG_NUMBER_1E18.mul(2002),
      )
    })
  })

  describe("massUpdatePools", () => {
    beforeEach(async () => {
      await initializeRewarder()

      // Set rewarder of pid 0 to the SimpleRewarder contract
      // From this point, users must call harvest, deposit, or withdraw to trigger
      // the rewarder to count their tokens.
      await miniChef.set(0, 1, simpleRewarder.address, true)
    })

    it("Successfully updates MiniChef pools", async () => {
      await miniChef.connect(farmer).harvest(0, farmerAddress)
      // [accSaddlePerShare, lastRewardTime, allocPoint]
      const accSaddlePerShareBefore = (await miniChef.poolInfo(0))[0]
      await setTimestamp((await getCurrentBlockTimestamp()) + 1000)
      await miniChef.massUpdatePools([0])
      const accSaddlePerShareAfter = (await miniChef.poolInfo(0))[0]
      expect(accSaddlePerShareAfter.sub(accSaddlePerShareBefore)).to.eq(
        BigNumber.from(1001000000000000),
      )
    })
  })
})
