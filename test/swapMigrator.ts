import { BigNumber, Signer } from "ethers"
import {
  getDeployedContractByName,
  getUserTokenBalances,
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
  let owner: Signer
  let ownerAddress: string

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
      owner = signers[0]
      ownerAddress = await owner.getAddress()

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
      const oldLPTokenAmount = await oldBTCPoolLPToken.balanceOf(ownerAddress)
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
      const newLPTokenAmount = await newBTCPoolLPToken.balanceOf(ownerAddress)
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
  })
})
