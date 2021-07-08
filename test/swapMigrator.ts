import { BigNumber, Signer } from "ethers"
import {
  getDeployedContractByName,
  getUserTokenBalances,
  impersonateAccount,
  MAX_UINT256,
} from "./testUtils"
import { solidity } from "ethereum-waffle"
import { deployments } from "hardhat"
import { GenericERC20 } from "../build/typechain/GenericERC20"
import { SwapGuarded } from "../build/typechain/SwapGuarded"
import { SwapFlashLoan } from "../build/typechain/SwapFlashLoan"
import { SwapFlashLoanV1 } from "../build/typechain/SwapFlashLoanV1"
import { LPToken } from "../build/typechain/LPToken"
import { SwapMigrator } from "../build/typechain/SwapMigrator"

import chai from "chai"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
  let signers: Array<Signer>
  let deployer: Signer
  let user1: Signer
  let deployerAddress: string

  let oldBTCPool: SwapGuarded
  let oldBTCPoolLPToken: GenericERC20
  let newBTCPool: SwapFlashLoan
  let newBTCPoolLPToken: LPToken

  let TBTC: GenericERC20
  let WBTC: GenericERC20
  let RENBTC: GenericERC20
  let SBTC: GenericERC20

  let oldUSDPool: SwapFlashLoanV1
  let oldUSDPoolLPToken: GenericERC20
  let newUSDPool: SwapFlashLoan
  let newUSDPoolLPToken: LPToken

  let DAI: GenericERC20
  let USDC: GenericERC20
  let USDT: GenericERC20

  let swapMigrator: SwapMigrator

  interface MigrationData {
    oldPoolAddress: string
    oldPoolLPTokenAddress: string
    newPoolAddress: string
    newPoolLPTokenAddress: string
    underlyingTokens: string[]
  }

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { deploy, execute, get } = deployments
      const getByName = (name: string) =>
        getDeployedContractByName(deployments, name)
      await deployments.fixture(undefined, { keepExistingDeployments: true }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      user1 = signers[1]
      deployerAddress = await deployer.getAddress()

      oldBTCPool = (await getByName("SaddleBTCPool")) as SwapGuarded
      oldBTCPoolLPToken = (await getByName(
        "SaddleBTCPoolLPToken",
      )) as GenericERC20
      newBTCPool = (await getByName("SaddleBTCPoolV2")) as SwapFlashLoan
      newBTCPoolLPToken = (await getByName("SaddleBTCPoolV2LPToken")) as LPToken

      TBTC = (await getByName("TBTC")) as GenericERC20
      WBTC = (await getByName("WBTC")) as GenericERC20
      RENBTC = (await getByName("RENBTC")) as GenericERC20
      SBTC = (await getByName("SBTC")) as GenericERC20

      oldUSDPool = (await getByName("SaddleUSDPool")) as SwapFlashLoanV1
      oldUSDPoolLPToken = (await getByName(
        "SaddleUSDPoolLPToken",
      )) as GenericERC20
      newUSDPool = (await getByName("SaddleUSDPoolV2")) as SwapFlashLoan
      newUSDPoolLPToken = (await getByName("SaddleUSDPoolV2LPToken")) as LPToken

      DAI = (await getByName("DAI")) as GenericERC20
      USDC = (await getByName("USDC")) as GenericERC20
      USDT = (await getByName("USDT")) as GenericERC20
      swapMigrator = (await getByName("SwapMigrator")) as SwapMigrator

      for (const token of [TBTC, WBTC, RENBTC, SBTC]) {
        await token.approve(oldBTCPool.address, MAX_UINT256)
        await token.approve(newBTCPool.address, MAX_UINT256)
      }

      await oldBTCPool.addLiquidity(
        [String(1e18), String(1e8), String(1e8), String(1e18)],
        0,
        MAX_UINT256,
        [],
      )

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

      await oldBTCPoolLPToken.approve(swapMigrator.address, MAX_UINT256)
      await oldBTCPoolLPToken.approve(oldBTCPool.address, MAX_UINT256)
      await oldUSDPoolLPToken.approve(swapMigrator.address, MAX_UINT256)
      await oldUSDPoolLPToken.approve(oldUSDPool.address, MAX_UINT256)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("migrateBTCPool", () => {
    it("Successfully migrates BTC pool LP token to an empty pool", async () => {
      const oldLPTokenAmount = await oldBTCPoolLPToken.balanceOf(
        deployerAddress,
      )
      const expectedWithdrawAmounts =
        await oldBTCPool.callStatic.removeLiquidity(
          oldLPTokenAmount,
          [0, 0, 0, 0],
          MAX_UINT256,
        )
      const expectedNewLPTokenAmount = await newBTCPool.callStatic.addLiquidity(
        expectedWithdrawAmounts,
        0,
        MAX_UINT256,
      )

      const beforeNewPoolBalances = await getUserTokenBalances(
        newBTCPool.address,
        [TBTC, WBTC, RENBTC, SBTC],
      )

      // Migrate old LPToken and check the user receives expected amount
      await swapMigrator.migrateBTCPool(oldLPTokenAmount, 0)
      const newLPTokenAmount = await newBTCPoolLPToken.balanceOf(
        deployerAddress,
      )
      expect(newLPTokenAmount).to.eq(expectedNewLPTokenAmount)

      // Check the new pool balance changes
      const afterNewPoolBalances = await getUserTokenBalances(
        newBTCPool.address,
        [TBTC, WBTC, RENBTC, SBTC],
      )
      const diffBalances = afterNewPoolBalances.map((el, i) =>
        el.sub(beforeNewPoolBalances[i]),
      )
      expect(diffBalances).to.eql(expectedWithdrawAmounts)
    })

    it("Successfully migrates BTC pool LP token to a non-empty pool", async () => {
      await newBTCPool.addLiquidity(
        [String(1e18), String(1e8), String(1e8), String(1e18)],
        0,
        MAX_UINT256,
      )
      const beforeNewBTCPoolLPTokenBalance = await newBTCPoolLPToken.balanceOf(
        deployerAddress,
      )

      const oldLPTokenAmount = await oldBTCPoolLPToken.balanceOf(
        deployerAddress,
      )
      const expectedWithdrawAmounts =
        await oldBTCPool.callStatic.removeLiquidity(
          oldLPTokenAmount,
          [0, 0, 0, 0],
          MAX_UINT256,
        )
      const expectedNewLPTokenAmount = await newBTCPool.callStatic.addLiquidity(
        expectedWithdrawAmounts,
        0,
        MAX_UINT256,
      )

      const beforeNewPoolBalances = await getUserTokenBalances(
        newBTCPool.address,
        [TBTC, WBTC, RENBTC, SBTC],
      )

      // Migrate old LPToken and check the user receives expected amount
      await swapMigrator.migrateBTCPool(oldLPTokenAmount, 0)
      const newLPTokenAmount = (
        await newBTCPoolLPToken.balanceOf(deployerAddress)
      ).sub(beforeNewBTCPoolLPTokenBalance)
      expect(newLPTokenAmount).to.eq(expectedNewLPTokenAmount)

      // Check the new pool balance changes
      const afterNewPoolBalances = await getUserTokenBalances(
        newBTCPool.address,
        [TBTC, WBTC, RENBTC, SBTC],
      )
      const diffBalances = afterNewPoolBalances.map((el, i) =>
        el.sub(beforeNewPoolBalances[i]),
      )
      expect(diffBalances).to.eql(expectedWithdrawAmounts)
    })

    it("Reverts when minAmount is not met", async () => {
      const oldLPTokenAmount = await oldBTCPoolLPToken.balanceOf(
        deployerAddress,
      )
      const expectedWithdrawAmounts =
        await oldBTCPool.callStatic.removeLiquidity(
          oldLPTokenAmount,
          [0, 0, 0, 0],
          MAX_UINT256,
        )
      const expectedNewLPTokenAmount = await newBTCPool.callStatic.addLiquidity(
        expectedWithdrawAmounts,
        0,
        MAX_UINT256,
      )

      await expect(
        swapMigrator.migrateBTCPool(
          oldLPTokenAmount,
          expectedNewLPTokenAmount.add(1),
        ),
      ).to.be.revertedWith("Couldn't mint min requested")
    })

    it("Reverts when migrating more than you own", async () => {
      const oldLPTokenAmount = await oldBTCPoolLPToken.balanceOf(
        deployerAddress,
      )

      await expect(
        swapMigrator.migrateBTCPool(oldLPTokenAmount.add(1), 0),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    })
  })

  describe("migrateUSDPool", () => {
    it("Successfully migrates USD pool LP token to an empty pool", async () => {
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
      await swapMigrator.migrateUSDPool(oldLPTokenAmount, 0)
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
      await swapMigrator.migrateUSDPool(oldLPTokenAmount, 0)
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
        swapMigrator.migrateUSDPool(
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
        swapMigrator.migrateUSDPool(oldLPTokenAmount.add(1), 0),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
    })
  })

  describe("rescue", () => {
    it("Successfully rescues tokens that are sent incorrectly", async () => {
      const lpBalance = await oldUSDPoolLPToken.balanceOf(deployerAddress)
      await oldUSDPoolLPToken.transfer(swapMigrator.address, lpBalance)
      expect(await oldUSDPoolLPToken.balanceOf(deployerAddress)).to.eq(0)

      const contractOwnerAddress = await swapMigrator.owner()
      const impersonatedOwner = await impersonateAccount(contractOwnerAddress)

      // Rescues stuck tokens
      await swapMigrator
        .connect(impersonatedOwner)
        .rescue(oldUSDPoolLPToken.address, deployerAddress, { gasPrice: 0 })
      expect(await oldUSDPoolLPToken.balanceOf(deployerAddress)).to.eq(
        lpBalance,
      )
    })
    it("Reverts when called by non-owner", async () => {
      await expect(
        swapMigrator
          .connect(user1)
          .rescue(oldUSDPoolLPToken.address, await user1.getAddress()),
      ).to.be.revertedWith("is not owner")
    })
  })
})
