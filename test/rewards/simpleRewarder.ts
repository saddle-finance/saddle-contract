import { BigNumber, Signer } from "ethers"
import { solidity } from "ethereum-waffle"

import {
  SimpleRewarder,
  MiniChefV2,
  GenericERC20,
  Swap,
  LPToken,
} from "../../build/typechain/"

import chai from "chai"
import { deployments, ethers } from "hardhat"
import {
  BIG_NUMBER_1E18,
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
  let miniChef: MiniChefV2
  let swapContract: Swap
  let simpleRewarder: SimpleRewarder
  let usdv2LpToken: LPToken
  let rewardToken1: GenericERC20
  let rewardToken2: GenericERC20
  let deployerAddress: string
  let farmerAddress: string

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      farmer = signers[10]
      deployerAddress = await deployer.getAddress()
      farmerAddress = await farmer.getAddress()
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
          BigNumber.from(10).pow(await token.decimals()),
        )
        await token.connect(farmer).approve(swapContract.address, MAX_UINT256)
      }
      await swapContract
        .connect(farmer)
        .addLiquidity([BIG_NUMBER_1E18, 1e6, 1e6], 0, MAX_UINT256)

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

  describe("init", () => {
    it("Reverts when given masterLpToken does not match", async () => {
      const data = ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256", "address", "uint256"],
        [rewardToken2.address, deployerAddress, 200, rewardToken1.address, 0],
      )
      expect(simpleRewarder.init(data)).to.be.revertedWith(
        "Rewarder: bad pid or masterLpToken",
      )
    })

    it("Successfully calls init", async () => {
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
      expect(await simpleRewarder.rewardToken()).to.eq(rewardToken2.address)
      expect(await simpleRewarder.masterLpToken()).to.eq(usdv2LpToken.address)
      expect(await simpleRewarder.rewardPerSecond()).to.eq(
        BIG_NUMBER_1E18.mul(2),
      )
    })
  })

  describe("onSaddleReward", () => {
    beforeEach(async () => {
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
      expect(
        (await rewardToken1.balanceOf(farmerAddress))
          .div(BIG_NUMBER_1E18)
          .toNumber(),
      ).to.eq(1006)
      expect(
        (await rewardToken2.balanceOf(farmerAddress))
          .div(BIG_NUMBER_1E18)
          .toNumber(),
      ).to.eq(2002)
    })
  })
})
