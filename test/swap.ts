import { BigNumber, Signer, Wallet } from "ethers"
import {
  MAX_UINT256,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
  getTokenBalances,
  setNextTimestamp,
  setTimestamp,
  asyncForEach,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import { LpToken } from "../build/typechain/LpToken"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/contracts/MathUtils.sol/MathUtils.json"
import { Swap } from "../build/typechain/Swap"
import SwapArtifact from "../build/artifacts/contracts/Swap.sol/Swap.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/contracts/SwapUtils.sol/SwapUtils.json"
import chai from "chai"
import { ethers } from "hardhat"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
  let signers: Array<Signer>
  let swap: Swap
  let allowlist: Allowlist
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let firstToken: LpToken
  let secondToken: LpToken
  let swapToken: LpToken
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let ownerAddress: string
  let user1Address: string
  let user2Address: string
  let swapStorage: {
    initialA: BigNumber
    futureA: BigNumber
    initialATime: BigNumber
    futureATime: BigNumber
    swapFee: BigNumber
    adminFee: BigNumber
    lpToken: string
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
    ownerAddress = await owner.getAddress()
    user1Address = await user1.getAddress()
    user2Address = await user2.getAddress()

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
    await asyncForEach([owner, user1, user2], async (signer) => {
      const address = await signer.getAddress()
      await firstToken.mint(address, String(1e20))
      await secondToken.mint(address, String(1e20))
    })

    // Deploy Allowlist
    allowlist = (await deployContract(
      signers[0] as Wallet,
      AllowlistArtifact,
    )) as Allowlist

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
        0,
        0,
        allowlist.address,
      ],
    )) as Swap
    await swap.deployed()

    swapStorage = await swap.swapStorage()

    swapToken = (await ethers.getContractAt(
      LPTokenArtifact.abi,
      swapStorage.lpToken,
    )) as LpToken

    // Set deposit limits
    allowlist.setPoolCap(swap.address, String(6e20))
    allowlist.setPoolAccountLimit(swap.address, String(2e20))
    allowlist.setMultipliers(
      [ownerAddress, user1Address, user2Address],
      [1000, 1000, 1000],
    )

    await asyncForEach([owner, user1, user2], async (signer) => {
      await firstToken.connect(signer).approve(swap.address, MAX_UINT256)
      await secondToken.connect(signer).approve(swap.address, MAX_UINT256)
    })

    await swap.addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)

    expect(await firstToken.balanceOf(swap.address)).to.eq(String(1e18))
    expect(await secondToken.balanceOf(swap.address)).to.eq(String(1e18))
  })

  describe("swapStorage", () => {
    describe("lpToken", async () => {
      it("Returns correct lpTokenName", async () => {
        expect(await swapToken.name()).to.eq(LP_TOKEN_NAME)
      })
      it("Returns correct lpTokenSymbol", async () => {
        expect(await swapToken.symbol()).to.eq(LP_TOKEN_SYMBOL)
      })
    })

    describe("A", async () => {
      it("Returns correct A value", async () => {
        expect(await swap.getA()).to.eq(INITIAL_A_VALUE)
        expect(await swap.getAPrecise()).to.eq(INITIAL_A_VALUE * 100)
      })
    })

    describe("fee", async () => {
      it("Returns correct fee value", async () => {
        expect((await swap.swapStorage()).swapFee).to.eq(SWAP_FEE)
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
      await expect(swap.getToken(2)).to.be.reverted
    })
  })

  describe("getTokenIndex", () => {
    it("Returns correct token indexes", async () => {
      expect(await swap.getTokenIndex(firstToken.address)).to.be.eq(0)
      expect(await swap.getTokenIndex(secondToken.address)).to.be.eq(1)
    })

    it("Reverts when token address is not found", async () => {
      await expect(swap.getTokenIndex("0xdead")).to.be.reverted
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

      expect(
        swap
          .connect(user1)
          .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256),
      ).to.be.reverted
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
          MAX_UINT256,
        )

      const actualPoolTokenAmount = await swapToken.balanceOf(user1Address)

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
          MAX_UINT256,
        )

      const actualPoolTokenAmount = await swapToken.balanceOf(user1Address)

      expect(actualPoolTokenAmount).to.gte(
        calculatedPoolTokenAmountWithNegativeSlippage,
      )

      expect(actualPoolTokenAmount).to.lte(
        calculatedPoolTokenAmountWithPositiveSlippage,
      )
    })

    it("Succeeds with correctly updated tokenBalance after imbalanced deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(3e18)], 0, MAX_UINT256)

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
      await swap.addLiquidity([String(1e18), String(3e18)], 0, MAX_UINT256)

      expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(1e18), String(3e18)],
            calculatedLPTokenAmountWithSlippage,
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async () => {
      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      await expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(2e18), String(1e16)],
            0,
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
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
            MAX_UINT256,
          ),
      ).to.emit(swap.connect(user1), "AddLiquidity")
    })
  })

  describe("removeLiquidity", () => {
    it("Succeeds even when contract is paused", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await swap.pause()

      // Owner and user 1 try to remove liquidity
      swapToken.approve(swap.address, String(2e18))
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)

      await swap.removeLiquidity(String(2e18), [0, 0], MAX_UINT256)
      await swap
        .connect(user1)
        .removeLiquidity(currentUser1Balance, [0, 0], MAX_UINT256)
      expect(await firstToken.balanceOf(swap.address)).to.eq(0)
      expect(await secondToken.balanceOf(swap.address)).to.eq(0)
    })

    it("Succeeds with expected return amounts of underlying tokens", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)

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
        .removeLiquidity(
          poolTokenBalanceBefore,
          [expectedFirstTokenAmount, expectedSecondTokenAmount],
          MAX_UINT256,
        )

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
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        swap
          .connect(user1)
          .removeLiquidity(
            currentUser1Balance.add(1),
            [MAX_UINT256, MAX_UINT256],
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
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
      await swap
        .connect(user2)
        .addLiquidity([String(1e16), String(2e18)], 0, MAX_UINT256)

      // User 1 tries to remove liquidity which get reverted due to front running
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      expect(
        swap
          .connect(user1)
          .removeLiquidity(
            currentUser1Balance,
            [expectedFirstTokenAmount, expectedSecondTokenAmount],
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      // User 1 tries removing liquidity with deadline of +5 minutes
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidity(
            currentUser1Balance,
            [0, 0],
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits removeLiquidity event", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

      // User 1 tries removes liquidity
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidity(currentUser1Balance, [0, 0], MAX_UINT256),
      ).to.emit(swap.connect(user1), "RemoveLiquidity")
    })
  })

  describe("removeLiquidityImbalance", () => {
    it("Reverts when contract is paused", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
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
          MAX_UINT256,
        ),
      ).to.be.reverted

      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            MAX_UINT256,
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Succeeds with calculated max amount of pool token to be burned (±0.1%)", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
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
          MAX_UINT256,
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

      expect(actualPoolTokenBurned).to.eq(String("1000934178112841889"))
      expect(actualPoolTokenBurned).to.gte(
        maxPoolTokenAmountToBeBurnedPositiveSlippage,
      )
      expect(actualPoolTokenBurned).to.lte(
        maxPoolTokenAmountToBeBurnedNegativeSlippage,
      )
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance.add(1),
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when minAmounts of underlying tokens are not reached due to front running", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
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
      await swap
        .connect(user2)
        .addLiquidity([String(1e16), String(1e20)], 0, MAX_UINT256)

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
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      // User 1 tries removing liquidity with deadline of +5 minutes
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance,
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits RemoveLiquidityImbalance event", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

      // User 1 removes liquidity
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)

      await expect(
        swap
          .connect(user1)
          .removeLiquidityImbalance(
            [String(1e18), String(1e16)],
            currentUser1Balance,
            MAX_UINT256,
          ),
      ).to.emit(swap.connect(user1), "RemoveLiquidityImbalance")
    })
  })

  describe("removeLiquidityOneToken", () => {
    it("Reverts when contract is paused.", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await swap.pause()

      // Owner and user 1 try to remove liquidity via single token
      swapToken.approve(swap.address, String(2e18))
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)

      expect(swap.removeLiquidityOneToken(String(2e18), 0, 0, MAX_UINT256)).to
        .be.reverted
      expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(currentUser1Balance, 0, 0, MAX_UINT256),
      ).to.be.reverted
    })

    it("Succeeds with calculated token amount as minAmount", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
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
      const before = await firstToken.balanceOf(user1Address)
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await swap
        .connect(user1)
        .removeLiquidityOneToken(
          currentUser1Balance,
          0,
          calculatedFirstTokenAmount,
          MAX_UINT256,
        )
      const after = await firstToken.balanceOf(user1Address)

      expect(after.sub(before)).to.eq(BigNumber.from("2008990034631583696"))
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(
            currentUser1Balance.add(1),
            0,
            0,
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when minAmount of underlying token is not reached due to front running", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
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
      await swap
        .connect(user2)
        .addLiquidity([String(1e16), String(1e20)], 0, MAX_UINT256)

      // User 1 initiates one token withdrawal
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(
            currentUser1Balance,
            0,
            calculatedFirstTokenAmount,
            MAX_UINT256,
          ),
      ).to.be.reverted
    })

    it("Reverts when block is mined after deadline", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      // User 1 tries removing liquidity with deadline of +5 minutes
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(
            currentUser1Balance,
            0,
            0,
            currentTimestamp + 60 * 5,
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits RemoveLiquidityOne event", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256)
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(currentUser1Balance, 0, 0, MAX_UINT256),
      ).to.emit(swap.connect(user1), "RemoveLiquidityOne")
    })
  })

  describe("swap", () => {
    it("Reverts when contract is paused", async () => {
      // Owner pauses the contract
      await swap.pause()

      // User 1 try to initiate swap
      await expect(swap.connect(user1).swap(0, 1, String(1e16), 0, MAX_UINT256))
        .to.be.reverted
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
      await swap
        .connect(user1)
        .swap(0, 1, String(1e17), calculatedSwapReturn, MAX_UINT256)

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
      await swap.connect(user2).swap(0, 1, String(1e17), 0, MAX_UINT256)

      // User 1 initiates swap
      await expect(
        swap
          .connect(user1)
          .swap(0, 1, String(1e17), calculatedSwapReturn, MAX_UINT256),
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
      await swap.connect(user2).swap(0, 1, String(1e17), 0, MAX_UINT256)

      // User 1 successfully initiates swap with 1% slippage from initial calculated amount
      await swap
        .connect(user1)
        .swap(
          0,
          1,
          String(1e17),
          calculatedSwapReturnWithNegativeSlippage,
          MAX_UINT256,
        )

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

    it("Reverts when block is mined after deadline", async () => {
      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)

      // User 1 tries swapping with deadline of +5 minutes
      await expect(
        swap
          .connect(user1)
          .swap(0, 1, String(1e17), 0, currentTimestamp + 60 * 5),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits TokenSwap event", async () => {
      // User 1 initiates swap
      await expect(
        swap.connect(user1).swap(0, 1, String(1e17), 0, MAX_UINT256),
      ).to.emit(swap, "TokenSwap")
    })
  })

  describe("getVirtualPrice", () => {
    it("Returns expected value after initial deposit", async () => {
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))
    })

    it("Returns expected values after swaps", async () => {
      // With each swap, virtual price will increase due to the fees
      await swap.connect(user1).swap(0, 1, String(1e17), 0, MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000050005862349911"),
      )

      await swap.connect(user1).swap(1, 0, String(1e17), 0, MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000100104768517937"),
      )
    })

    it("Returns expected values after imbalanced withdrawal", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))

      await swapToken.connect(user1).approve(swap.address, String(2e18))
      await swap
        .connect(user1)
        .removeLiquidityImbalance([String(1e18), 0], String(2e18), MAX_UINT256)

      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000100094088440633"),
      )

      await swapToken.connect(user2).approve(swap.address, String(2e18))
      await swap
        .connect(user2)
        .removeLiquidityImbalance([0, String(1e18)], String(2e18), MAX_UINT256)

      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000200154928939884"),
      )
    })

    it("Value is unchanged after balanced deposits", async () => {
      // pool is 1:1 ratio
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))

      // pool changes to 2:1 ratio, thus changing the virtual price
      await swap
        .connect(user2)
        .addLiquidity([String(2e18), String(0)], 0, MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
      // User 2 makes balanced deposit, keeping the ratio 2:1
      await swap
        .connect(user2)
        .addLiquidity([String(2e18), String(1e18)], 0, MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
    })

    it("Value is unchanged after balanced withdrawals", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      await swapToken.connect(user1).approve(swap.address, String(1e18))
      await swap
        .connect(user1)
        .removeLiquidity(String(1e18), ["0", "0"], MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))
    })
  })

  describe("setSwapFee", () => {
    it("Emits NewSwapFee event", async () => {
      await expect(swap.setSwapFee(BigNumber.from(1e8))).to.emit(
        swap,
        "NewSwapFee",
      )
    })

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
    it("Emits NewAdminFee event", async () => {
      await expect(swap.setAdminFee(BigNumber.from(1e10))).to.emit(
        swap,
        "NewAdminFee",
      )
    })

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

      await swap.connect(user1).swap(0, 1, String(1e17), 0, MAX_UINT256)

      expect(await swap.getAdminBalance(0)).to.eq(0)
      expect(await swap.getAdminBalance(1)).to.eq(0)
    })

    it("Returns expected amounts after swaps when adminFee is higher than 0", async () => {
      // Sets adminFee to 1% of the swap fees
      await swap.setAdminFee(BigNumber.from(10 ** 8))
      await swap.connect(user1).swap(0, 1, String(1e17), 0, MAX_UINT256)

      expect(await swap.getAdminBalance(0)).to.eq(0)
      expect(await swap.getAdminBalance(1)).to.eq(String(998024139765))

      // After the first swap, the pool becomes imbalanced; there are more 0th token than 1st token in the pool.
      // Therefore swapping from 1st -> 0th will result in more 0th token returned
      // Also results in higher fees collected on the second swap.

      await swap.connect(user1).swap(1, 0, String(1e17), 0, MAX_UINT256)

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
      await swap.connect(user1).swap(0, 1, String(1e17), 0, MAX_UINT256)
      await swap.connect(user1).swap(1, 0, String(1e17), 0, MAX_UINT256)

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
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)

      for (let i = 0; i < 10; i++) {
        await swap.connect(user2).swap(0, 1, String(1e17), 0, MAX_UINT256)
        await swap.connect(user2).swap(1, 0, String(1e17), 0, MAX_UINT256)
      }

      await swap.withdrawAdminFees()

      const [firstTokenBefore, secondTokenBefore] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      const user1LPTokenBalance = await swapToken.balanceOf(user1Address)
      await swapToken.connect(user1).approve(swap.address, user1LPTokenBalance)
      await swap
        .connect(user1)
        .removeLiquidity(user1LPTokenBalance, [0, 0], MAX_UINT256)

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

  describe("Guarded launch", () => {
    it("Only owner can remove the guard", async () => {
      expect(await swap.isGuarded()).to.eq(true)
      await expect(swap.connect(user1).setIsGuarded(false)).to.be.reverted
      await swap.connect(owner).setIsGuarded(false)
      expect(await swap.isGuarded()).to.eq(false)
    })

    it("Reverts when depositing over individual limit", async () => {
      const tokenAmount = BigNumber.from(10).pow(22)

      await firstToken.mint(user1Address, tokenAmount)
      await secondToken.mint(user1Address, tokenAmount)

      await expect(
        swap
          .connect(user1)
          .addLiquidity([tokenAmount, tokenAmount], 0, MAX_UINT256),
      ).to.be.revertedWith("Deposit limit reached")
    })

    it("Reverts when depositing over pool cap", async () => {
      await allowlist.setPoolCap(swap.address, String(1e17))

      expect(
        await allowlist.getAllowedAmount(swap.address, user1Address),
      ).to.eq(String(2e20))

      await expect(
        swap
          .connect(user1)
          .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256),
      ).to.be.revertedWith("Pool TVL cap reached")
    })
  })

  describe("Test withdrawal fees on removeLiquidity", () => {
    beforeEach(async () => {
      expect(await swapToken.balanceOf(await user1.getAddress())).to.eq(0)
      await swap.setDefaultWithdrawFee(String(5e7))
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)
    })

    it("Removing liquidity immediately after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)

      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [firstBalanceBefore, secondBalanceBefore] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      // Manually set the timestamp between addLiquidity and removeLiquidity to 1 second
      const currentPoolTokenBalance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      await setNextTimestamp(depositTimestamp + 1)
      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [firstBalanceAfter, secondBalanceAfter] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      // Returned amounts are about 99.5% of initial deposits
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "995000002100000000",
      )
      expect(secondBalanceAfter.sub(secondBalanceBefore)).to.eq(
        "995000002100000000",
      )
    })

    it("Removing liquidity 2 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)

      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [firstBalanceBefore, secondBalanceBefore] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )
      const currentPoolTokenBalance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      // 2 weeks = 2 * 604800 seconds
      await setNextTimestamp(depositTimestamp + 2 * 604800)
      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [firstBalanceAfter, secondBalanceAfter] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      // Returned amounts are 99.75% of initial deposits
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "997500000000000000",
      )
      expect(secondBalanceAfter.sub(secondBalanceBefore)).to.eq(
        "997500000000000000",
      )
    })

    it("Removing liquidity 4 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)

      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [firstBalanceBefore, secondBalanceBefore] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      // 52 weeks = 604800 * 4 seconds
      const currentPoolTokenBalance = await swapToken.balanceOf(
        await user1.getAddress(),
      )
      await setNextTimestamp(depositTimestamp + 4 * 604800)
      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [firstBalanceAfter, secondBalanceAfter] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      // Returned amounts are 100% of initial deposits
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "1000000000000000000",
      )
      expect(secondBalanceAfter.sub(secondBalanceBefore)).to.eq(
        "1000000000000000000",
      )
    })
  })

  describe("Test withdrawal fees on removeLiquidityOne", async () => {
    beforeEach(async () => {
      await swapToken.approve(swap.address, MAX_UINT256)
      await swap.removeLiquidity(
        await swapToken.balanceOf(await owner.getAddress()),
        [0, 0],
        MAX_UINT256,
      )
      expect(await swapToken.totalSupply()).to.eq(0)
      await swap.setDefaultWithdrawFee(String(5e7))

      // reset the pool
      await swap.addLiquidity([String(1e19), String(1e19)], 0, MAX_UINT256)
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)
    })

    it("Removing liquidity immediately after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [firstBalanceBefore] = await getTokenBalances(user1, firstToken)
      const [swapTokenBalance] = await getTokenBalances(user1, swapToken)

      const expectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmount).to.eq("1997027120160681835")

      await setNextTimestamp(depositTimestamp + 1)
      await swap
        .connect(user1)
        .removeLiquidityOneToken(swapTokenBalance, 0, 0, MAX_UINT256)

      const [firstBalanceAfter] = await getTokenBalances(user1, firstToken)

      // Close to 1997027120160681835 * 99.5%
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "1987041988753635378",
      )
    })

    it("Removing liquidity 2 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [firstBalanceBefore] = await getTokenBalances(user1, firstToken)
      const [swapTokenBalance] = await getTokenBalances(user1, swapToken)

      const expectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmount).to.eq("1997027120160681835")

      await setNextTimestamp(depositTimestamp + 2 * 604800)
      await swap
        .connect(user1)
        .removeLiquidityOneToken(swapTokenBalance, 0, 0, MAX_UINT256)

      const [firstBalanceAfter] = await getTokenBalances(user1, firstToken)

      // 1997027120160681835 * 99.75% = 1992034552360280130
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "1992034552360280130",
      )
    })

    it("Removing liquidity 4 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [firstBalanceBefore] = await getTokenBalances(user1, firstToken)
      const [swapTokenBalance] = await getTokenBalances(user1, swapToken)

      const expectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmount).to.eq("1997027120160681835")

      await setNextTimestamp(depositTimestamp + 4 * 604800)
      await swap
        .connect(user1)
        .removeLiquidityOneToken(swapTokenBalance, 0, 0, MAX_UINT256)

      const [firstBalanceAfter] = await getTokenBalances(user1, firstToken)

      // 1997027120160681835 * 100%
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "1997027120160681835",
      )
    })
  })

  describe("Test withdrawal fees on removeLiquidityImbalance", async () => {
    beforeEach(async () => {
      await swapToken.approve(swap.address, MAX_UINT256)
      await swap.removeLiquidity(
        await swapToken.balanceOf(await owner.getAddress()),
        [0, 0],
        MAX_UINT256,
      )
      expect(await swapToken.totalSupply()).to.eq(0)
      await swap.setDefaultWithdrawFee(String(5e7))

      // reset the pool
      await swap.addLiquidity([String(1e19), String(1e19)], 0, MAX_UINT256)
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)
    })

    it("Removing liquidity immediately after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [
        firstTokenBefore,
        secondTokenBefore,
        swapTokenBefore,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      await setNextTimestamp(depositTimestamp + 1)
      await swap
        .connect(user1)
        .removeLiquidityImbalance(
          [String(1e18), String(1e17)],
          swapTokenBefore,
          MAX_UINT256,
        )

      const [
        firstTokenAfter,
        secondTokenAfter,
        swapTokenAfter,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1e18))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(String(1e17))

      // Below comparison with defaultWithdrawFee set to zero results in 1100830653956319289
      // Total amount of burned token should be close to
      // 1100830653956319289 / 0.995
      expect(swapTokenBefore.sub(swapTokenAfter)).to.eq("1106362463952721723")
    })

    it("Removing liquidity 2 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [
        firstTokenBefore,
        secondTokenBefore,
        swapTokenBefore,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      await setNextTimestamp(depositTimestamp + 2 * 604800)
      await swap
        .connect(user1)
        .removeLiquidityImbalance(
          [String(1e18), String(1e17)],
          swapTokenBefore,
          MAX_UINT256,
        )

      const [
        firstTokenAfter,
        secondTokenAfter,
        swapTokenAfter,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1e18))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(String(1e17))

      // 1100830653956319289 / 0.9975 = 1103589628026385252
      expect(swapTokenBefore.sub(swapTokenAfter)).to.eq("1103589628026385252")
    })

    it("Removing liquidity 4 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      const [
        firstTokenBefore,
        secondTokenBefore,
        swapTokenBefore,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      await setNextTimestamp(depositTimestamp + 4 * 604800)
      await swap
        .connect(user1)
        .removeLiquidityImbalance(
          [String(1e18), String(1e17)],
          swapTokenBefore,
          MAX_UINT256,
        )

      const [
        firstTokenAfter,
        secondTokenAfter,
        swapTokenAfter,
      ] = await getTokenBalances(user1, firstToken, secondToken, swapToken)

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1e18))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(String(1e17))

      // 1100830653956319289 / 1.0000 = 1100830653956319289
      expect(swapTokenBefore.sub(swapTokenAfter)).to.eq("1100830653956319289")
    })
  })

  describe("updateUserWithdrawFee", async () => {
    it("Test adding liquidity, and once again at 2 weeks mark then removing all deposits at 4 weeks mark", async () => {
      await swap.setDefaultWithdrawFee(String(5e7))
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)
      const depositTimestamp = (
        await swap.getDepositTimestamp(await user1.getAddress())
      ).toNumber()

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      // 2 weeks after
      await setNextTimestamp(depositTimestamp + 2 * 604800)
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(2e18)], 0, MAX_UINT256)

      // At 2 weeks mark, half of first deposit's withdrawal fee is discounted, 0.25%.
      // We are adding twice the amount of first deposit at full withdrawal fee amount, 0.5%.
      // Remainder of the fees + new fees is then again stretched out to be discounted over the decay period (4 weeks)
      // (2e18 * 0.25% + 4e18 * 0.5%) / 6e18 = 0.41666666%
      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from("41666666"))

      await swapToken
        .connect(user1)
        .approve(
          swap.address,
          await swapToken.balanceOf(await user1.getAddress()),
        )

      const [firstBalanceBefore, secondBalanceBefore] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )
      const currentPoolTokenBalance = await swapToken.balanceOf(
        await user1.getAddress(),
      )

      // 4 weeks after initial deposit
      await setNextTimestamp(depositTimestamp + 4 * 604800)
      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [firstBalanceAfter, secondBalanceAfter] = await getTokenBalances(
        user1,
        firstToken,
        secondToken,
      )

      // Returned amounts are (100 - 0.41666666 / 2) = 99.79166667% of total deposits
      // 3e18 * 99.79166667% = 2.9937500001e18
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "2993750000100000000",
      )
      expect(secondBalanceAfter.sub(secondBalanceBefore)).to.eq(
        "2993750000100000000",
      )
    })
  })

  describe("setDefaultWithdrawFee", () => {
    it("Emits NewWithdrawFee event", async () => {
      await expect(swap.setDefaultWithdrawFee(String(5e7))).to.emit(
        swap,
        "NewWithdrawFee",
      )
    })

    it("Setting the withdraw fee affects past deposits as well", async () => {
      await swap.setDefaultWithdrawFee(String(5e7))
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256)

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(5e7))

      await swap.setDefaultWithdrawFee(String(0))

      expect(
        await swap.calculateCurrentWithdrawFee(await user1.getAddress()),
      ).to.eq(BigNumber.from(0))
    })

    it("Reverts when fee is too high", async () => {
      await expect(swap.setDefaultWithdrawFee(String(15e8))).to.be.reverted
    })
  })

  describe("rampA", () => {
    it("Emits RampA event", async () => {
      await expect(
        swap.rampA(100, (await getCurrentBlockTimestamp()) + 86401),
      ).to.emit(swap, "RampA")
    })

    it("Succeeds to ramp upwards", async () => {
      // call rampA(), changing A to 100 within a span of 1 day (86400 seconds)
      await swap.rampA(100, (await getCurrentBlockTimestamp()) + 86401)

      // set timestamp to +10000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 10000)
      expect(await swap.getA()).to.be.eq(55)
      expect(await swap.getAPrecise()).to.be.eq(5578)

      // set timestamp to the end of ramp period
      await setTimestamp((await getCurrentBlockTimestamp()) + 76401)
      expect(await swap.getA()).to.be.eq(100)
      expect(await swap.getAPrecise()).to.be.eq(10000)
    })

    it("Succeeds to ramp downwards", async () => {
      // call rampA()
      await swap.rampA(10, (await getCurrentBlockTimestamp()) + 86401)

      // set timestamp to +10000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 10000)
      expect(await swap.getA()).to.be.eq(45)
      expect(await swap.getAPrecise()).to.be.eq(4538)

      // set timestamp to the end of ramp period
      await setTimestamp((await getCurrentBlockTimestamp()) + 76401)
      expect(await swap.getA()).to.be.eq(10)
      expect(await swap.getAPrecise()).to.be.eq(1000)
    })

    it("Reverts when non-owner calls it", async () => {
      await expect(
        swap
          .connect(user1)
          .rampA(55, (await getCurrentBlockTimestamp()) + 86401),
      ).to.be.reverted
    })

    it("Reverts with 'Ramp already ongoing'", async () => {
      await swap.rampA(55, (await getCurrentBlockTimestamp()) + 86401)
      await expect(
        swap.rampA(55, (await getCurrentBlockTimestamp()) + 86401),
      ).to.be.revertedWith("Ramp already ongoing")
    })

    it("Reverts with 'Insufficient ramp time'", async () => {
      await expect(
        swap.rampA(55, (await getCurrentBlockTimestamp()) + 86399),
      ).to.be.revertedWith("Insufficient ramp time")
    })

    it("Reverts with 'futureA_ must be between 0 and MAX_A'", async () => {
      await expect(
        swap.rampA(0, (await getCurrentBlockTimestamp()) + 86401),
      ).to.be.revertedWith("futureA_ must be between 0 and MAX_A")
    })

    it("Reverts with 'futureA_ is too small'", async () => {
      await expect(
        swap.rampA(4, (await getCurrentBlockTimestamp()) + 86401),
      ).to.be.revertedWith("futureA_ is too small")
    })

    it("Reverts with 'futureA_ is too large'", async () => {
      await expect(
        swap.rampA(501, (await getCurrentBlockTimestamp()) + 86401),
      ).to.be.revertedWith("futureA_ is too large")
    })
  })

  describe("stopRampA", () => {
    it("Emits StopRampA event", async () => {
      // call rampA()
      await swap.rampA(100, (await getCurrentBlockTimestamp()) + 86401)

      // Stop ramp
      expect(swap.stopRampA()).to.emit(swap, "StopRampA")
    })

    it("Stop ramp succeeds", async () => {
      // call rampA()
      await swap.rampA(100, (await getCurrentBlockTimestamp()) + 86401)

      // set timestamp to +10000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 10000)
      expect(await swap.getA()).to.be.eq(55)
      expect(await swap.getAPrecise()).to.be.eq(5578)

      // Stop ramp
      await swap.stopRampA()
      expect(await swap.getA()).to.be.eq(55)
      expect(await swap.getAPrecise()).to.be.eq(5578)

      // set timestamp to +80000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 80000)

      // verify ramp has stopped
      expect(await swap.getA()).to.be.eq(55)
      expect(await swap.getAPrecise()).to.be.eq(5578)
    })
  })
})
