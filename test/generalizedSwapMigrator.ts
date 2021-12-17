import { BigNumber, Signer } from "ethers"
import {
  getUserTokenBalances,
  impersonateAccount,
  MAX_UINT256,
} from "./testUtils"
import { solidity } from "ethereum-waffle"
import { deployments, ethers } from "hardhat"
import { GenericERC20 } from "../build/typechain/GenericERC20"
import { SwapFlashLoan } from "../build/typechain/SwapFlashLoan"
import { SwapFlashLoanV1 } from "../build/typechain/SwapFlashLoanV1"
import { LPToken } from "../build/typechain/LPToken"
import { GeneralizedSwapMigrator } from "../build/typechain/GeneralizedSwapMigrator"

import chai from "chai"

chai.use(solidity)
const { expect } = chai

describe("GeneralizedSwapMigrator", () => {
  let signers: Array<Signer>
  let deployer: Signer
  let user1: Signer
  let deployerAddress: string

  let oldUSDPool: SwapFlashLoanV1
  let oldUSDPoolLPToken: GenericERC20
  let newUSDPool: SwapFlashLoan
  let newUSDPoolLPToken: LPToken

  let DAI: GenericERC20
  let USDC: GenericERC20
  let USDT: GenericERC20

  let genSwapMigrator: GeneralizedSwapMigrator

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { deploy, execute, get } = deployments
      await deployments.fixture(undefined, { keepExistingDeployments: true }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      user1 = signers[1]
      deployerAddress = await deployer.getAddress()

      oldUSDPool = await ethers.getContract("SaddleUSDPool")
      oldUSDPoolLPToken = await ethers.getContract("SaddleUSDPoolLPToken")
      newUSDPool = await ethers.getContract("SaddleUSDPoolV2")
      newUSDPoolLPToken = await ethers.getContract("SaddleUSDPoolV2LPToken")

      DAI = await ethers.getContract("DAI")
      USDC = await ethers.getContract("USDC")
      USDT = await ethers.getContract("USDT")
      genSwapMigrator = await ethers.getContract("GeneralizedSwapMigrator")

      for (const token of [DAI, USDC, USDT]) {
        await token.approve(oldUSDPool.address, MAX_UINT256)
        await token.approve(newUSDPool.address, MAX_UINT256)
      }
      await oldUSDPool.addLiquidity(
        [
          BigNumber.from(10).pow(18).mul(10000),
          BigNumber.from(10).pow(6).mul(10000),
          BigNumber.from(10).pow(6).mul(10000),
        ],
        0,
        MAX_UINT256,
      )

      await oldUSDPoolLPToken.approve(genSwapMigrator.address, MAX_UINT256)
      await oldUSDPoolLPToken.approve(oldUSDPool.address, MAX_UINT256)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("migrationMap", () => {
    it("Successfully reads migrationMap", async () => {
      const migrationData: {
        newPoolAddress: string
        oldPoolLPTokenAddress: string
        newPoolLPTokenAddress: string
      } = await genSwapMigrator.migrationMap(oldUSDPool.address)
      expect(migrationData.newPoolAddress).to.eq(newUSDPool.address)
      expect(migrationData.newPoolLPTokenAddress).to.eq(
        newUSDPoolLPToken.address,
      )
      expect(migrationData.oldPoolLPTokenAddress).to.eq(
        oldUSDPoolLPToken.address,
      )
    })
  })

  describe("migrate", () => {
    it("Successfully migrates USD pool LP token to a new pool", async () => {
      const oldLPTokenAmount = await oldUSDPoolLPToken.balanceOf(
        deployerAddress,
      )
      const expectedWithdrawAmounts =
        await oldUSDPool.callStatic.removeLiquidity(
          oldLPTokenAmount,
          [0, 0, 0],
          MAX_UINT256,
        )
      const expectedNewLPTokenAmount = await newUSDPool.callStatic.addLiquidity(
        expectedWithdrawAmounts,
        0,
        MAX_UINT256,
      )

      const beforeNewPoolBalances = await getUserTokenBalances(
        newUSDPool.address,
        [DAI, USDC, USDT],
      )

      // Migrate old LPToken and check the user receives expected amount
      await genSwapMigrator.migrate(oldUSDPool.address, oldLPTokenAmount, 0)
      const newLPTokenAmount = await newUSDPoolLPToken.balanceOf(
        deployerAddress,
      )
      expect(newLPTokenAmount).to.eq(expectedNewLPTokenAmount)

      // Check the new pool balance changes
      const afterNewPoolBalances = await getUserTokenBalances(
        newUSDPool.address,
        [DAI, USDC, USDT],
      )
      const diffBalances = afterNewPoolBalances.map((el, i) =>
        el.sub(beforeNewPoolBalances[i]),
      )
      expect(diffBalances).to.eql(expectedWithdrawAmounts)
    })

    it("Successfully migrates USD pool LP token to a non-empty pool", async () => {
      await newUSDPool.addLiquidity(
        [
          BigNumber.from(10).pow(18).mul(10000),
          BigNumber.from(10).pow(6).mul(10000),
          BigNumber.from(10).pow(6).mul(10000),
        ],
        0,
        MAX_UINT256,
      )
      const beforeNewUSDPoolLPTokenBalance = await newUSDPoolLPToken.balanceOf(
        deployerAddress,
      )

      const oldLPTokenAmount = await oldUSDPoolLPToken.balanceOf(
        deployerAddress,
      )
      const expectedWithdrawAmounts =
        await oldUSDPool.callStatic.removeLiquidity(
          oldLPTokenAmount,
          [0, 0, 0],
          MAX_UINT256,
        )
      const expectedNewLPTokenAmount = await newUSDPool.callStatic.addLiquidity(
        expectedWithdrawAmounts,
        0,
        MAX_UINT256,
      )

      const beforeNewPoolBalances = await getUserTokenBalances(
        newUSDPool.address,
        [DAI, USDC, USDT],
      )

      // Migrate old LPToken and check the user receives expected amount
      await genSwapMigrator.migrate(oldUSDPool.address, oldLPTokenAmount, 0)
      const newLPTokenAmount = (
        await newUSDPoolLPToken.balanceOf(deployerAddress)
      ).sub(beforeNewUSDPoolLPTokenBalance)
      expect(newLPTokenAmount).to.eq(expectedNewLPTokenAmount)

      // Check the new pool balance changes
      const afterNewPoolBalances = await getUserTokenBalances(
        newUSDPool.address,
        [DAI, USDC, USDT],
      )
      const diffBalances = afterNewPoolBalances.map((el, i) =>
        el.sub(beforeNewPoolBalances[i]),
      )
      expect(diffBalances).to.eql(expectedWithdrawAmounts)
    })

    it("Reverts when minAmount is not met", async () => {
      const oldLPTokenAmount = await oldUSDPoolLPToken.balanceOf(
        deployerAddress,
      )
      const expectedWithdrawAmounts =
        await oldUSDPool.callStatic.removeLiquidity(
          oldLPTokenAmount,
          [0, 0, 0],
          MAX_UINT256,
        )
      const expectedNewLPTokenAmount = await newUSDPool.callStatic.addLiquidity(
        expectedWithdrawAmounts,
        0,
        MAX_UINT256,
      )

      await expect(
        genSwapMigrator.migrate(
          oldUSDPool.address,
          oldLPTokenAmount,
          expectedNewLPTokenAmount.add(1),
        ),
      ).to.be.revertedWith("Couldn't mint min requested")
    })

    it("Reverts when migrating more than you own", async () => {
      const oldLPTokenAmount = await oldUSDPoolLPToken.balanceOf(
        deployerAddress,
      )

      await expect(
        genSwapMigrator.migrate(oldUSDPool.address, oldLPTokenAmount.add(1), 0),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    })
  })

  describe("rescue", () => {
    it("Successfully rescues tokens that are sent incorrectly", async () => {
      const lpBalance = await oldUSDPoolLPToken.balanceOf(deployerAddress)
      await oldUSDPoolLPToken.transfer(genSwapMigrator.address, lpBalance)
      expect(await oldUSDPoolLPToken.balanceOf(deployerAddress)).to.eq(0)

      const contractOwnerAddress = await genSwapMigrator.owner()
      const impersonatedOwner = await impersonateAccount(contractOwnerAddress)
      await ethers.provider.send("hardhat_setBalance", [
        await impersonatedOwner.getAddress(),
        `0x${(1e18).toString(16)}`,
      ])

      // Rescues stuck tokens
      await genSwapMigrator
        .connect(impersonatedOwner)
        .rescue(oldUSDPoolLPToken.address, deployerAddress)
      expect(await oldUSDPoolLPToken.balanceOf(deployerAddress)).to.eq(
        lpBalance,
      )
    })
    it("Reverts when called by non-owner", async () => {
      await expect(
        genSwapMigrator
          .connect(user1)
          .rescue(oldUSDPoolLPToken.address, await user1.getAddress()),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })
})
