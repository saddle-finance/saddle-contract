import { ethers } from "@nomiclabs/buidler"
import { Wallet, Signer, BigNumber } from "ethers"
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"

import SwapUtilsArtifact from "../build/artifacts/SwapUtils.json"
import { SwapUtils } from "../build/typechain/SwapUtils"

import SwapArtifact from "../build/artifacts/Swap.json"
import { Swap } from "../build/typechain/Swap"

import LPTokenArtifact from "../build/artifacts/LPToken.json"
import { LpToken } from "../build/typechain/LpToken"

import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { MathUtils } from "../build/typechain/MathUtils"

import {
  deployContractWithLibraries,
  getTokenBalances,
  MAX_UINT256,
} from "./testUtils"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
  let signers: Array<Signer>
  let swap: Swap
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let firstToken: LpToken
  let secondToken: LpToken
  let swapToken: LpToken
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let swapStorage: {
    lpToken: string
    A: BigNumber
    swapFee: BigNumber
    adminFee: BigNumber
    "0": string
    "1": BigNumber
    "2": BigNumber
    "3": BigNumber
  }

  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]

    // Deploy dummy tokens
    firstToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "First Token",
      "FIRST",
      "18",
    ])) as LpToken

    secondToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "Second Token",
      "SECOND",
      "18",
    ])) as LpToken

    // Mint dummy tokens
    await firstToken.mint(await owner.getAddress(), String(1e20))
    await secondToken.mint(await owner.getAddress(), String(1e20))

    await firstToken.mint(await user1.getAddress(), String(1e20))
    await secondToken.mint(await user1.getAddress(), String(1e20))

    await firstToken.mint(await user2.getAddress(), String(1e20))
    await secondToken.mint(await user2.getAddress(), String(1e20))

    // Deploy MathUtils
    mathUtils = (await deployContract(
      signers[0] as Wallet,
      MathUtilsArtifact,
    )) as MathUtils

    // Deploy SwapUtils with MathUtils library
    swapUtils = (await deployContractWithLibraries(owner, SwapUtilsArtifact, {
      MathUtils: mathUtils.address,
    })) as SwapUtils
    await swapUtils.deployed()

    // Deploy Swap with SwapUtils library
    swap = (await deployContractWithLibraries(
      owner,
      SwapArtifact,
      { SwapUtils: swapUtils.address },
      [
        [firstToken.address, secondToken.address],
        [String(1e18), String(1e18)],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
      ],
    )) as Swap
    await swap.deployed()

    swapStorage = await swap.swapStorage()

    swapToken = (await ethers.getContractAt(
      LPTokenArtifact.abi,
      swapStorage.lpToken,
    )) as LpToken

    // Populate the pool with initial liquidity
    await firstToken.approve(swap.address, MAX_UINT256)
    await secondToken.approve(swap.address, MAX_UINT256)
    await swap.addLiquidity([String(1e18), String(1e18)], 0)

    expect(await firstToken.balanceOf(swap.address)).to.eq(String(1e18))
    expect(await secondToken.balanceOf(swap.address)).to.eq(String(1e18))

    await firstToken.connect(user1).approve(swap.address, MAX_UINT256)
    await secondToken.connect(user1).approve(swap.address, MAX_UINT256)

    await firstToken.connect(user2).approve(swap.address, MAX_UINT256)
    await secondToken.connect(user2).approve(swap.address, MAX_UINT256)
  })

  describe("swapStorage", () => {
    describe("lpToken", async () => {
      it("Returns correct lpTokeName", async () => {
        expect(await swapToken.name()).to.eq(LP_TOKEN_NAME)
      })
      it("Returns correct lpTokenSymbol", async () => {
        expect(await swapToken.symbol()).to.eq(LP_TOKEN_SYMBOL)
      })
    })

    describe("A", async () => {
      it("Returns correct A value", async () => {
        expect(swapStorage.A).to.eq(INITIAL_A_VALUE)
      })
    })

    describe("fee", async () => {
      it("Returns correct fee value", async () => {
        expect(swapStorage.swapFee).to.eq(SWAP_FEE)
      })
    })

    describe("adminFee", async () => {
      it("Returns correct adminFee value", async () => {
        expect(swapStorage.adminFee).to.eq(0)
      })
    })
  })

  describe("getToken", () => {
    it("Returns correct addresses of pooled tokens", async () => {
      expect(await swap.getToken(0)).to.eq(firstToken.address)
      expect(await swap.getToken(1)).to.eq(secondToken.address)
    })

    it("Reverts when index is out of range", async () => {
      expect(swap.getToken(2)).to.be.reverted
    })
  })

  describe("getTokenBalance", () => {
    it("Returns correct balances of pooled tokens", async () => {
      expect(await swap.getTokenBalance(0)).to.eq(BigNumber.from(String(1e18)))
      expect(await swap.getTokenBalance(1)).to.eq(BigNumber.from(String(1e18)))
    })

    it("Reverts when index is out of range", async () => {
      expect(swap.getTokenBalance(2)).to.be.reverted
    })
  })

  describe("getA", () => {
    it("Returns correct value", async () => {
      expect(await swap.getA()).to.eq(INITIAL_A_VALUE)
    })
  })

  describe("addLiquidity", () => {
    it("Reverts when contract is paused", async () => {
      await swap.pause()

      expect(swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0))
        .to.be.reverted
    })

    it("Succeeds with expected output amount of pool tokens", async () => {
      const calculatedPoolTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedPoolTokenAmountWithSlippage = calculatedPoolTokenAmount
        .mul(999)
        .div(1000)

      await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          calculatedPoolTokenAmountWithSlippage,
        )

      const actualPoolTokenAmount = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      // The actual pool token amount is less than 4e18 due to the imbalance of the underlying tokens
      expect(actualPoolTokenAmount).to.eq(BigNumber.from("3991672211258372957"))
    })

    it("Succeeds with actual pool token amount being within ±0.1% range of calculated pool token", async () => {
      const calculatedPoolTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedPoolTokenAmountWithNegativeSlippage = calculatedPoolTokenAmount
        .mul(999)
        .div(1000)

      const calculatedPoolTokenAmountWithPositiveSlippage = calculatedPoolTokenAmount
        .mul(1001)
        .div(1000)

      await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          calculatedPoolTokenAmountWithNegativeSlippage,
        )

      const actualPoolTokenAmount = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      expect(actualPoolTokenAmount).to.gte(
        calculatedPoolTokenAmountWithNegativeSlippage,
      )

      expect(actualPoolTokenAmount).to.lte(
        calculatedPoolTokenAmountWithPositiveSlippage,
      )
    })

    it("Succeeds with correctly updated tokenBalance after imbalanced deposit", async () => {
      await swap.connect(user1).addLiquidity([String(1e18), String(3e18)], 0)

      // Check updated token balance
      expect(await swap.getTokenBalance(0)).to.eq(BigNumber.from(String(2e18)))
      expect(await swap.getTokenBalance(1)).to.eq(BigNumber.from(String(4e18)))
    })

    it("Reverts when minToMint is not reached due to front running", async () => {
      const calculatedLPTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(1e18), String(3e18)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      // Someone else deposits thus front running user 1's deposit
      await swap.addLiquidity([String(1e18), String(3e18)], 0)

      expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(1e18), String(3e18)],
            calculatedLPTokenAmountWithSlippage,
          ),
      ).to.be.reverted
    })

    it("Emits addLiquidity event", async () => {
      const calculatedLPTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount([String(2e18), String(1e16)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(2e18), String(1e16)],
            calculatedLPTokenAmountWithSlippage,
          ),
      ).to.emit(swap.connect(user1), "AddLiquidity")
    })
  })

  describe("removeLiquidity", () => {
    it("Succeeds even when contract is paused", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await swap.pause()

      // Owner and user 1 try to remove liquidity
      swapToken.approve(swap.address, String(2e18))
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)

      await swap.removeLiquidity(String(2e18), [0, 0])
      await swap.connect(user1).removeLiquidity(currentUser1Balance, [0, 0])
      expect(await firstToken.balanceOf(swap.address)).to.eq(0)
      expect(await secondToken.balanceOf(swap.address)).to.eq(0)
    })

    it("Succeeds with expected return amounts of underlying tokens", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)

      const [
        firstTokenBalanceBefore,
        secondTokenBalanceBefore,
        poolTokenBalanceBefore,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      expect(poolTokenBalanceBefore).to.eq(
        BigNumber.from("1996275270169644725"),
      )

      const [
        expectedFirstTokenAmount,
        expectedSecondTokenAmount,
      ] = await swap.calculateRemoveLiquidity(poolTokenBalanceBefore)

      expect(expectedFirstTokenAmount).to.eq(
        BigNumber.from("1498601924450190405"),
      )
      expect(expectedSecondTokenAmount).to.eq(
        BigNumber.from("504529314564897436"),
      )

      // User 1 removes liquidity
      await swapToken
        .connect(user1)
        .approve(swap.address, poolTokenBalanceBefore)
      await swap
        .connect(user1)
        .removeLiquidity(poolTokenBalanceBefore, [
          expectedFirstTokenAmount,
          expectedSecondTokenAmount,
        ])

      const [
        firstTokenBalanceAfter,
        secondTokenBalanceAfter,
      ] = await getTokenBalances(user1, firstToken, secondToken)

      // Check the actual returned token amounts match the expected amounts
      expect(firstTokenBalanceAfter.sub(firstTokenBalanceBefore)).to.eq(
        expectedFirstTokenAmount,
      )
      expect(secondTokenBalanceAfter.sub(secondTokenBalanceBefore)).to.eq(
        expectedSecondTokenAmount,
      )
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        swap
          .connect(user1)
          .removeLiquidity(currentUser1Balance.add(1), [
            MAX_UINT256,
            MAX_UINT256,
          ]),
      ).to.be.reverted
    })

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      const [
        expectedFirstTokenAmount,
        expectedSecondTokenAmount,
      ] = await swap.calculateRemoveLiquidity(currentUser1Balance)

      expect(expectedFirstTokenAmount).to.eq(
        BigNumber.from("1498601924450190405"),
      )
      expect(expectedSecondTokenAmount).to.eq(
        BigNumber.from("504529314564897436"),
      )

      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await swap.connect(user2).addLiquidity([String(1e16), String(2e18)], 0)

      // User 1 tries to remove liquidity which get reverted due to front running
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      expect(
        swap
          .connect(user1)
          .removeLiquidity(currentUser1Balance, [
            expectedFirstTokenAmount,
            expectedSecondTokenAmount,
          ]),
      ).to.be.reverted
    })

    it("Emits removeLiquidity event", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      // User 1 removes liquidity
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap.connect(user1).removeLiquidity(currentUser1Balance, [0, 0]),
      ).to.emit(swap.connect(user1), "RemoveLiquidity")
    })
  })

  describe("removeLiquidityImbalance", () => {
    it("Reverts when contract is paused", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await swap.pause()

      // Owner and user 1 try to initiate imbalanced liquidity withdrawal
      swapToken.approve(swap.address, MAX_UINT256)
      swapToken.connect(user1).approve(swap.address, MAX_UINT256)

      await expect(
        swap.removeLiquidityImbalance(
          [String(1e18), String(1e16)],
          MAX_UINT256,
        ),
      ).to.be.reverted

      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance([String(1e18), String(1e16)], MAX_UINT256),
      ).to.be.reverted
    })

    it("Succeeds with calculated max amount of pool token to be burned (±0.1%)", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await swap.calculateTokenAmount(
        [String(1e18), String(1e16)],
        false,
      )

      // ±0.1% range of pool token to be burned
      const maxPoolTokenAmountToBeBurnedNegativeSlippage = maxPoolTokenAmountToBeBurned
        .mul(1001)
        .div(1000)
      const maxPoolTokenAmountToBeBurnedPositiveSlippage = maxPoolTokenAmountToBeBurned
        .mul(999)
        .div(1000)

      const [
        firstTokenBalanceBefore,
        secondTokenBalanceBefore,
        poolTokenBalanceBefore,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      // User 1 withdraws imbalanced tokens
      await swapToken
        .connect(user1)
        .approve(swap.address, maxPoolTokenAmountToBeBurnedNegativeSlippage)
      await swap
        .connect(user1)
        .removeLiquidityImbalance(
          [String(1e18), String(1e16)],
          maxPoolTokenAmountToBeBurnedNegativeSlippage,
        )

      const [
        firstTokenBalanceAfter,
        secondTokenBalanceAfter,
        poolTokenBalanceAfter,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      // Check the actual returned token amounts match the requested amounts
      expect(firstTokenBalanceAfter.sub(firstTokenBalanceBefore)).to.eq(
        String(1e18),
      )
      expect(secondTokenBalanceAfter.sub(secondTokenBalanceBefore)).to.eq(
        String(1e16),
      )

      // Check the actual burned pool token amount
      const actualPoolTokenBurned = poolTokenBalanceBefore.sub(
        poolTokenBalanceAfter,
      )

      expect(actualPoolTokenBurned).to.eq(String("1000934178112841888"))
      expect(actualPoolTokenBurned).to.gte(
        maxPoolTokenAmountToBeBurnedPositiveSlippage,
      )
      expect(actualPoolTokenBurned).to.lte(
        maxPoolTokenAmountToBeBurnedNegativeSlippage,
      )
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance.add(1),
          ),
      ).to.be.reverted
    })

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await swap.calculateTokenAmount(
        [String(1e18), String(1e16)],
        false,
      )

      // Calculate +0.1% of pool token to be burned
      const maxPoolTokenAmountToBeBurnedNegativeSlippage = maxPoolTokenAmountToBeBurned
        .mul(1001)
        .div(1000)

      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await swap.connect(user2).addLiquidity([String(1e16), String(1e20)], 0)

      // User 1 tries to remove liquidity which get reverted due to front running
      await swapToken
        .connect(user1)
        .approve(swap.address, maxPoolTokenAmountToBeBurnedNegativeSlippage)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            maxPoolTokenAmountToBeBurnedNegativeSlippage,
          ),
      ).to.be.reverted
    })

    it("Emits RemoveLiquidityImbalance event", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      // User 1 removes liquidity
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)

      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance,
          ),
      ).to.emit(swap.connect(user1), "RemoveLiquidityImbalance")
    })
  })

  describe("removeLiquidityOneToken", () => {
    it("Reverts when contract is paused.", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await swap.pause()

      // Owner and user 1 try to remove liquidity via single token
      swapToken.approve(swap.address, String(2e18))
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)

      expect(swap.removeLiquidityOneToken(String(2e18), 0, 0)).to.be.reverted
      expect(
        swap.connect(user1).removeLiquidityOneToken(currentUser1Balance, 0, 0),
      ).to.be.reverted
    })

    it("Succeeds with calculated token amount as minAmount", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        currentUser1Balance,
        0,
      )
      expect(calculatedFirstTokenAmount).to.eq(
        BigNumber.from("2008990034631583696"),
      )

      // User 1 initiates one token withdrawal
      const before = await firstToken.balanceOf(await user1.getAddress())
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await swap
        .connect(user1)
        .removeLiquidityOneToken(
          currentUser1Balance,
          0,
          calculatedFirstTokenAmount,
        )
      const after = await firstToken.balanceOf(await user1.getAddress())

      expect(after.sub(before)).to.eq(BigNumber.from("2008990034631583696"))
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(currentUser1Balance.add(1), 0, 0),
      ).to.be.reverted
    })

    it("Reverts when minAmount of underlying token is not reached due to front running", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        currentUser1Balance,
        0,
      )
      expect(calculatedFirstTokenAmount).to.eq(
        BigNumber.from("2008990034631583696"),
      )

      // User 2 adds liquidity before User 1 initiates withdrawal
      await swap.connect(user2).addLiquidity([String(1e16), String(1e20)], 0)

      // User 1 initiates one token withdrawal
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(
            currentUser1Balance,
            0,
            calculatedFirstTokenAmount,
          ),
      ).to.be.reverted
    })

    it("Emits RemoveLiquidityOne event", async () => {
      // User 1 adds liquidity
      await swap.connect(user1).addLiquidity([String(2e18), String(1e16)], 0)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap.connect(user1).removeLiquidityOneToken(currentUser1Balance, 0, 0),
      ).to.emit(swap.connect(user1), "RemoveLiquidityOne")
    })
  })

  describe("swap", () => {
    it("Reverts when contract is paused", async () => {
      // Owner pauses the contract
      await swap.pause()

      // User 1 try to initiate swap
      await expect(swap.connect(user1).swap(0, 1, String(1e16), 0)).to.be
        .reverted
    })

    it("Succeeds with expected swap amounts", async () => {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await swap.calculateSwap(0, 1, String(1e17))
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99702611562565289"))

      const [
        tokenFromBalanceBefore,
        tokenToBalanceBefore,
      ] = await getTokenBalances(user1, firstToken, secondToken)

      // User 1 successfully initiates swap
      await swap.connect(user1).swap(0, 1, String(1e17), calculatedSwapReturn)

      // Check the sent and received amounts are as expected
      const [
        tokenFromBalanceAfter,
        tokenToBalanceAfter,
      ] = await getTokenBalances(user1, firstToken, secondToken)
      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
        BigNumber.from(String(1e17)),
      )
      expect(tokenToBalanceAfter.sub(tokenToBalanceBefore)).to.eq(
        calculatedSwapReturn,
      )
    })

    it("Reverts when minDy (minimum amount token to receive) is not reached due to front running", async () => {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await swap.calculateSwap(0, 1, String(1e17))
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99702611562565289"))

      // User 2 swaps before User 1 does
      await swap.connect(user2).swap(0, 1, String(1e17), 0)

      // User 1 initiates swap
      await expect(
        swap.connect(user1).swap(0, 1, String(1e17), calculatedSwapReturn),
      ).to.be.reverted
    })

    it("Succeeds when using lower minDy even when transaction is front-ran", async () => {
      // User 1 calculates how much token to receive with 1% slippage
      const calculatedSwapReturn = await swap.calculateSwap(0, 1, String(1e17))
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99702611562565289"))

      const [
        tokenFromBalanceBefore,
        tokenToBalanceBefore,
      ] = await getTokenBalances(user1, firstToken, secondToken)

      const calculatedSwapReturnWithNegativeSlippage = calculatedSwapReturn
        .mul(99)
        .div(100)

      // User 2 swaps before User 1 does
      await swap.connect(user2).swap(0, 1, String(1e17), 0)

      // User 1 successfully initiates swap with 1% slippage from initial calculated amount
      await swap
        .connect(user1)
        .swap(0, 1, String(1e17), calculatedSwapReturnWithNegativeSlippage)

      // Check the sent and received amounts are as expected
      const [
        tokenFromBalanceAfter,
        tokenToBalanceAfter,
      ] = await getTokenBalances(user1, firstToken, secondToken)

      expect(tokenFromBalanceBefore.sub(tokenFromBalanceAfter)).to.eq(
        BigNumber.from(String(1e17)),
      )

      const actualReceivedAmount = tokenToBalanceAfter.sub(tokenToBalanceBefore)

      expect(actualReceivedAmount).to.eq(BigNumber.from("99286252365528551"))
      expect(actualReceivedAmount).to.gt(
        calculatedSwapReturnWithNegativeSlippage,
      )
      expect(actualReceivedAmount).to.lt(calculatedSwapReturn)
    })

    it("Emits TokenSwap event", async () => {
      // User 1 initiates swap
      await expect(swap.connect(user1).swap(0, 1, String(1e17), 0)).to.emit(
        swap,
        "TokenSwap",
      )
    })
  })

  describe("getVirtualPrice", () => {
    it("Returns expected value after initial deposit", async () => {
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))
    })

    it("Returns expected values after swaps", async () => {
      // With each swap, virtual price will increase due to the fees
      await swap.connect(user1).swap(0, 1, String(1e17), 0)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000050005862349911"),
      )

      await swap.connect(user1).swap(1, 0, String(1e17), 0)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000100104768517937"),
      )
    })

    it("Returns expected values after imbalanced withdrawal", async () => {
      await swap.connect(user1).addLiquidity([String(1e18), String(1e18)], 0)
      await swap.connect(user2).addLiquidity([String(1e18), String(1e18)], 0)
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))

      await swapToken.connect(user1).approve(swap.address, String(2e18))
      await swap
        .connect(user1)
        .removeLiquidityImbalance([String(1e18), 0], String(2e18))

      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000100094088440633"),
      )

      await swapToken.connect(user2).approve(swap.address, String(2e18))
      await swap
        .connect(user2)
        .removeLiquidityImbalance([0, String(1e18)], String(2e18))

      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000200154928939884"),
      )
    })

    it("Value is unchanged after balanced deposits", async () => {
      // pool is 1:1 ratio
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))
      await swap.connect(user1).addLiquidity([String(1e18), String(1e18)], 0)
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))

      // pool changes to 2:1 ratio, thus changing the virtual price
      await swap.connect(user2).addLiquidity([String(2e18), String(0)], 0)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
      // User 2 makes balanced deposit, keeping the ratio 2:1
      await swap.connect(user2).addLiquidity([String(2e18), String(1e18)], 0)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
    })

    it("Value is unchanged after balanced withdrawals", async () => {
      await swap.connect(user1).addLiquidity([String(1e18), String(1e18)], 0)
      await swapToken.connect(user1).approve(swap.address, String(1e18))
      await swap.connect(user1).removeLiquidity(String(1e18), ["0", "0"])
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))
    })
  })

  describe("setSwapFee", () => {
    it("Reverts when called by non-owners", async () => {
      await expect(swap.connect(user1).setSwapFee(0)).to.be.reverted
      await expect(swap.connect(user2).setSwapFee(BigNumber.from(1e8))).to.be
        .reverted
    })

    it("Reverts when fee is higher than the limit", async () => {
      await expect(swap.setSwapFee(BigNumber.from(1e8).add(1))).to.be.reverted
    })

    it("Succeeds when fee is within the limit", async () => {
      await swap.setSwapFee(BigNumber.from(1e8))
      expect((await swap.swapStorage()).swapFee).to.eq(BigNumber.from(1e8))
    })
  })

  describe("setAdminFee", () => {
    it("Reverts when called by non-owners", async () => {
      await expect(swap.connect(user1).setSwapFee(0)).to.be.reverted
      await expect(swap.connect(user2).setSwapFee(BigNumber.from(1e10))).to.be
        .reverted
    })

    it("Reverts when adminFee is higher than the limit", async () => {
      await expect(swap.setAdminFee(BigNumber.from(1e10).add(1))).to.be.reverted
    })

    it("Succeeds when adminFee is within the limit", async () => {
      await swap.setAdminFee(BigNumber.from(1e10))
      expect((await swap.swapStorage()).adminFee).to.eq(BigNumber.from(1e10))
    })
  })

  describe("getAdminBalance", () => {
    it("Is always 0 when adminFee is set to 0", async () => {
      expect(await swap.getAdminBalance(0)).to.eq(0)
      expect(await swap.getAdminBalance(1)).to.eq(0)

      await swap.connect(user1).swap(0, 1, String(1e17), 0)

      expect(await swap.getAdminBalance(0)).to.eq(0)
      expect(await swap.getAdminBalance(1)).to.eq(0)
    })

    it("Returns expected amounts after swaps when adminFee is higher than 0", async () => {
      // Sets adminFee to 1% of the swap fees
      await swap.setAdminFee(BigNumber.from(10 ** 8))
      await swap.connect(user1).swap(0, 1, String(1e17), 0)

      expect(await swap.getAdminBalance(0)).to.eq(0)
      expect(await swap.getAdminBalance(1)).to.eq(String(998024139765))

      // After the first swap, the pool becomes imbalanced; there are more 0th token than 1st token in the pool.
      // Therefore swapping from 1st -> 0th will result in more 0th token returned
      // Also results in higher fees collected on the second swap.

      await swap.connect(user1).swap(1, 0, String(1e17), 0)

      expect(await swap.getAdminBalance(0)).to.eq(String(1001973776101))
      expect(await swap.getAdminBalance(1)).to.eq(String(998024139765))
    })
  })

  describe("withdrawAdminFees", () => {
    it("Reverts when called by non-owners", async () => {
      await expect(swap.connect(user1).withdrawAdminFees()).to.be.reverted
      await expect(swap.connect(user2).withdrawAdminFees()).to.be.reverted
    })

    it("Succeeds with expected amount of fees withdrawn", async () => {
      // Sets adminFee to 1% of the swap fees
      await swap.setAdminFee(BigNumber.from(10 ** 8))
      await swap.connect(user1).swap(0, 1, String(1e17), 0)
      await swap.connect(user1).swap(1, 0, String(1e17), 0)

      expect(await swap.getAdminBalance(0)).to.eq(String(1001973776101))
      expect(await swap.getAdminBalance(1)).to.eq(String(998024139765))

      const [firstTokenBefore, secondTokenBefore] = await getTokenBalances(
        owner,
        firstToken,
        secondToken,
      )

      await swap.withdrawAdminFees()

      const [firstTokenAfter, secondTokenAfter] = await getTokenBalances(
        owner,
        firstToken,
        secondToken,
      )

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1001973776101))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(
        String(998024139765),
      )
    })

    it("Withdrawing admin fees has no impact on users' withdrawal", async () => {
      // Sets adminFee to 1% of the swap fees
      await swap.setAdminFee(BigNumber.from(10 ** 8))
      await swap.connect(user1).addLiquidity([String(1e18), String(1e18)], 0)

      for (let i = 0; i < 10; i++) {
        await swap.connect(user2).swap(0, 1, String(1e17), 0)
        await swap.connect(user2).swap(1, 0, String(1e17), 0)
      }

      await swap.withdrawAdminFees()

      const [firstTokenBefore, secondTokenBefore] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      const user1LPTokenBalance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      await swapToken.connect(user1).approve(swap.address, user1LPTokenBalance)
      await swap.connect(user1).removeLiquidity(user1LPTokenBalance, [0, 0])

      const [firstTokenAfter, secondTokenAfter] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(
        BigNumber.from("1000009516257264879"),
      )

      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(
        BigNumber.from("1000980987206499309"),
      )
    })
  })
})
