import { BigNumber, Signer, Wallet } from "ethers"
import {
  MAX_UINT256,
  TIME,
  ZERO_ADDRESS,
  asyncForEach,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
  getTestMerkleProof,
  getTestMerkleRoot,
  getUserTokenBalance,
  getUserTokenBalances,
  setNextTimestamp,
  setTimestamp,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"
import { deployments, ethers } from "hardhat"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import { GenericERC20 } from "../build/typechain/GenericERC20"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import { LPToken } from "../build/typechain/LPToken"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/contracts/MathUtils.sol/MathUtils.json"
import { Swap } from "../build/typechain/Swap"
import SwapArtifact from "../build/artifacts/contracts/Swap.sol/Swap.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/contracts/SwapUtils.sol/SwapUtils.json"
import { TestSwapReturnValues } from "../build/typechain/TestSwapReturnValues"
import TestSwapReturnValuesArtifact from "../build/artifacts/contracts/helper/test/TestSwapReturnValues.sol/TestSwapReturnValues.json"
import chai from "chai"

chai.use(solidity)
const { expect } = chai

describe("Swap", async () => {
  let signers: Array<Signer>
  let swap: Swap
  let testSwapReturnValues: TestSwapReturnValues
  let allowlist: Allowlist
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let firstToken: GenericERC20
  let secondToken: GenericERC20
  let swapToken: LPToken
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
  const MERKLE_ROOT = getTestMerkleRoot()

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      user1 = signers[1]
      user2 = signers[2]
      ownerAddress = await owner.getAddress()
      user1Address = await user1.getAddress()
      user2Address = await user2.getAddress()

      // Deploy dummy tokens
      firstToken = (await deployContract(
        owner as Wallet,
        GenericERC20Artifact,
        ["First Token", "FIRST", "18"],
      )) as GenericERC20

      secondToken = (await deployContract(
        owner as Wallet,
        GenericERC20Artifact,
        ["Second Token", "SECOND", "18"],
      )) as GenericERC20

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
        [MERKLE_ROOT],
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
          [18, 18],
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

      expect(await swap.getVirtualPrice()).to.be.eq(0)

      swapStorage = await swap.swapStorage()

      swapToken = (await ethers.getContractAt(
        LPTokenArtifact.abi,
        swapStorage.lpToken,
      )) as LPToken

      testSwapReturnValues = (await deployContract(
        owner,
        TestSwapReturnValuesArtifact,
        [swap.address, swapToken.address, 2],
      )) as TestSwapReturnValues
      await testSwapReturnValues.deployed()

      // Set deposit limits
      await allowlist.setPoolCap(swap.address, String(6e20))
      await allowlist.setPoolAccountLimit(swap.address, String(2e20))

      await asyncForEach([owner, user1, user2], async (signer) => {
        await firstToken.connect(signer).approve(swap.address, MAX_UINT256)
        await secondToken.connect(signer).approve(swap.address, MAX_UINT256)
        await swapToken.connect(signer).approve(swap.address, MAX_UINT256)
      })

      await swap.addLiquidity(
        [String(1e18), String(1e18)],
        0,
        MAX_UINT256,
        getTestMerkleProof(ownerAddress),
      )

      expect(await firstToken.balanceOf(swap.address)).to.eq(String(1e18))
      expect(await secondToken.balanceOf(swap.address)).to.eq(String(1e18))
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("swapStorage", () => {
    beforeEach(async () => {
      await swap.disableGuard()
    })
    describe("lpToken", async () => {
      it("Returns correct lpTokenName", async () => {
        expect(await swapToken.name()).to.eq(LP_TOKEN_NAME)
      })

      it("Returns correct lpTokenSymbol", async () => {
        expect(await swapToken.symbol()).to.eq(LP_TOKEN_SYMBOL)
      })

      it("Returns true after successfully calling transferFrom", async () => {
        // User 1 adds liquidity
        await swap
          .connect(user1)
          .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])

        // User 1 approves User 2 for MAX_UINT256
        swapToken.connect(user1).approve(user2Address, MAX_UINT256)

        // User 2 transfers 1337 from User 1 to themselves using transferFrom
        await swapToken
          .connect(user2)
          .transferFrom(user1Address, user2Address, 1337)

        expect(await swapToken.balanceOf(user2Address)).to.eq(1337)
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
      await expect(swap.getTokenIndex(ZERO_ADDRESS)).to.be.revertedWith(
        "Token does not exist",
      )
    })
  })

  describe("getTokenBalance", () => {
    it("Returns correct balances of pooled tokens", async () => {
      expect(await swap.getTokenBalance(0)).to.eq(BigNumber.from(String(1e18)))
      expect(await swap.getTokenBalance(1)).to.eq(BigNumber.from(String(1e18)))
    })

    it("Reverts when index is out of range", async () => {
      await expect(swap.getTokenBalance(2)).to.be.reverted
    })
  })

  describe("getA", () => {
    it("Returns correct value", async () => {
      expect(await swap.getA()).to.eq(INITIAL_A_VALUE)
    })
  })

  describe("addLiquidity", () => {
    beforeEach(async () => {
      await swap.disableGuard()
    })

    it("Reverts when contract is paused", async () => {
      await swap.pause()

      await expect(
        swap
          .connect(user1)
          .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, []),
      ).to.be.reverted
    })

    it("Reverts with 'Amounts must match pooled tokens'", async () => {
      await expect(
        swap.connect(user1).addLiquidity([String(1e16)], 0, MAX_UINT256, []),
      ).to.be.revertedWith("Amounts must match pooled tokens")
    })

    it("Reverts with 'Cannot withdraw more than available'", async () => {
      await expect(
        swap
          .connect(user1)
          .calculateTokenAmount(
            user1Address,
            [MAX_UINT256, String(3e18)],
            false,
          ),
      ).to.be.revertedWith("Cannot withdraw more than available")
    })

    it("Reverts with 'Must supply all tokens in pool'", async () => {
      swapToken.approve(swap.address, String(2e18))
      await swap.removeLiquidity(String(2e18), [0, 0], MAX_UINT256)
      await expect(
        swap
          .connect(user1)
          .addLiquidity([0, String(3e18)], MAX_UINT256, MAX_UINT256, []),
      ).to.be.revertedWith("Must supply all tokens in pool")
    })

    it("Succeeds with expected output amount of pool tokens", async () => {
      const calculatedPoolTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount(user1Address, [String(1e18), String(3e18)], true)

      const calculatedPoolTokenAmountWithSlippage = calculatedPoolTokenAmount
        .mul(999)
        .div(1000)

      await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          calculatedPoolTokenAmountWithSlippage,
          MAX_UINT256,
          [],
        )

      const actualPoolTokenAmount = await swapToken.balanceOf(user1Address)

      // The actual pool token amount is less than 4e18 due to the imbalance of the underlying tokens
      expect(actualPoolTokenAmount).to.eq(BigNumber.from("3991672211258372957"))
    })

    it("Succeeds with actual pool token amount being within ±0.1% range of calculated pool token", async () => {
      const calculatedPoolTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount(user1Address, [String(1e18), String(3e18)], true)

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
          [],
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
        .addLiquidity([String(1e18), String(3e18)], 0, MAX_UINT256, [])

      // Check updated token balance
      expect(await swap.getTokenBalance(0)).to.eq(BigNumber.from(String(2e18)))
      expect(await swap.getTokenBalance(1)).to.eq(BigNumber.from(String(4e18)))
    })

    it("Returns correct minted lpToken amount", async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))

      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0,
        [],
      )
    })

    it("Reverts when minToMint is not reached due to front running", async () => {
      const calculatedLPTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount(user1Address, [String(1e18), String(3e18)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      // Someone else deposits thus front running user 1's deposit
      await swap.addLiquidity([String(1e18), String(3e18)], 0, MAX_UINT256, [])

      await expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(1e18), String(3e18)],
            calculatedLPTokenAmountWithSlippage,
            MAX_UINT256,
            [],
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
            [],
          ),
      ).to.be.revertedWith("Deadline not met")
    })

    it("Emits addLiquidity event", async () => {
      const calculatedLPTokenAmount = await swap
        .connect(user1)
        .calculateTokenAmount(user1Address, [String(2e18), String(1e16)], true)

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      await expect(
        swap
          .connect(user1)
          .addLiquidity(
            [String(2e18), String(1e16)],
            calculatedLPTokenAmountWithSlippage,
            MAX_UINT256,
            [],
          ),
      ).to.emit(swap.connect(user1), "AddLiquidity")
    })
  })

  describe("removeLiquidity", () => {
    beforeEach(async () => {
      await swap.disableGuard()
    })
    it("Reverts with 'Cannot exceed total supply'", async () => {
      await expect(
        swap.calculateRemoveLiquidity(ZERO_ADDRESS, MAX_UINT256),
      ).to.be.revertedWith("Cannot exceed total supply")
    })

    it("Reverts with 'minAmounts must match poolTokens'", async () => {
      await expect(
        swap.removeLiquidity(String(2e18), [0], MAX_UINT256),
      ).to.be.revertedWith("minAmounts must match poolTokens")
    })

    it("Succeeds even when contract is paused", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])

      const [
        firstTokenBalanceBefore,
        secondTokenBalanceBefore,
        poolTokenBalanceBefore,
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

      expect(poolTokenBalanceBefore).to.eq(
        BigNumber.from("1996275270169644725"),
      )

      const [
        expectedFirstTokenAmount,
        expectedSecondTokenAmount,
      ] = await swap.calculateRemoveLiquidity(
        user1Address,
        poolTokenBalanceBefore,
      )

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
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

      // Check the actual returned token amounts match the expected amounts
      expect(firstTokenBalanceAfter.sub(firstTokenBalanceBefore)).to.eq(
        expectedFirstTokenAmount,
      )
      expect(secondTokenBalanceAfter.sub(secondTokenBalanceBefore)).to.eq(
        expectedSecondTokenAmount,
      )
    })

    it("Returns correct amounts of received tokens", async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))

      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0,
        [],
      )
      const tokenBalance = await swapToken.balanceOf(
        testSwapReturnValues.address,
      )

      await testSwapReturnValues.test_removeLiquidity(tokenBalance, [0, 0])
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      const [
        expectedFirstTokenAmount,
        expectedSecondTokenAmount,
      ] = await swap.calculateRemoveLiquidity(user1Address, currentUser1Balance)

      expect(expectedFirstTokenAmount).to.eq(
        BigNumber.from("1498601924450190405"),
      )
      expect(expectedSecondTokenAmount).to.eq(
        BigNumber.from("504529314564897436"),
      )

      // User 2 adds liquidity, which leads to change in balance of underlying tokens
      await swap
        .connect(user2)
        .addLiquidity([String(1e16), String(2e18)], 0, MAX_UINT256, [])

      // User 1 tries to remove liquidity which get reverted due to front running
      await swapToken.connect(user1).approve(swap.address, currentUser1Balance)
      await expect(
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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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
    beforeEach(async () => {
      await swap.disableGuard()
    })
    it("Reverts when contract is paused", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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

    it("Reverts with 'Amounts should match pool tokens'", async () => {
      await expect(
        swap.removeLiquidityImbalance([String(1e18)], MAX_UINT256, MAX_UINT256),
      ).to.be.revertedWith("Amounts should match pool tokens")
    })

    it("Reverts with 'Cannot withdraw more than available'", async () => {
      await expect(
        swap.removeLiquidityImbalance(
          [MAX_UINT256, MAX_UINT256],
          1,
          MAX_UINT256,
        ),
      ).to.be.revertedWith("Cannot withdraw more than available")
    })

    it("Succeeds with calculated max amount of pool token to be burned (±0.1%)", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await swap.calculateTokenAmount(
        user1Address,
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
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

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
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

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

    it("Returns correct amount of burned lpToken", async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))

      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0,
        [],
      )

      const tokenBalance = await swapToken.balanceOf(
        testSwapReturnValues.address,
      )
      await testSwapReturnValues.test_removeLiquidityImbalance(
        [String(1e18), String(1e17)],
        tokenBalance,
      )
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates amount of pool token to be burned
      const maxPoolTokenAmountToBeBurned = await swap.calculateTokenAmount(
        user1Address,
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
        .addLiquidity([String(1e16), String(1e20)], 0, MAX_UINT256, [])

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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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
    beforeEach(async () => {
      await swap.disableGuard()
    })
    it("Reverts when contract is paused.", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // Owner pauses the contract
      await swap.pause()

      // Owner and user 1 try to remove liquidity via single token
      swapToken.approve(swap.address, String(2e18))
      swapToken.connect(user1).approve(swap.address, currentUser1Balance)

      await expect(
        swap.removeLiquidityOneToken(String(2e18), 0, 0, MAX_UINT256),
      ).to.be.reverted
      await expect(
        swap
          .connect(user1)
          .removeLiquidityOneToken(currentUser1Balance, 0, 0, MAX_UINT256),
      ).to.be.reverted
    })

    it("Reverts with 'Token index out of range'", async () => {
      await expect(
        swap.calculateRemoveLiquidityOneToken(ZERO_ADDRESS, 1, 5),
      ).to.be.revertedWith("Token index out of range")
    })

    it("Reverts with 'Withdraw exceeds available'", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      await expect(
        swap.calculateRemoveLiquidityOneToken(
          user1Address,
          currentUser1Balance.mul(2),
          0,
        ),
      ).to.be.revertedWith("Withdraw exceeds available")
    })

    it("Reverts with 'Token not found'", async () => {
      await expect(
        swap.connect(user1).removeLiquidityOneToken(0, 9, 1, MAX_UINT256),
      ).to.be.revertedWith("Token not found")
    })

    it("Succeeds with calculated token amount as minAmount", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        user1Address,
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

    it("Returns correct amount of received token", async () => {
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))
      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0,
        [],
      )
      await testSwapReturnValues.test_removeLiquidityOneToken(
        String(2e18),
        0,
        0,
      )
    })

    it("Reverts when user tries to burn more LP tokens than they own", async () => {
      // User 1 adds liquidity
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)
      expect(currentUser1Balance).to.eq(BigNumber.from("1996275270169644725"))

      // User 1 calculates the amount of underlying token to receive.
      const calculatedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        user1Address,
        currentUser1Balance,
        0,
      )
      expect(calculatedFirstTokenAmount).to.eq(
        BigNumber.from("2008990034631583696"),
      )

      // User 2 adds liquidity before User 1 initiates withdrawal
      await swap
        .connect(user2)
        .addLiquidity([String(1e16), String(1e20)], 0, MAX_UINT256, [])

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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
      const currentUser1Balance = await swapToken.balanceOf(user1Address)

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
        .addLiquidity([String(2e18), String(1e16)], 0, MAX_UINT256, [])
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

    it("Reverts with 'Token index out of range'", async () => {
      await expect(swap.calculateSwap(0, 9, String(1e17))).to.be.revertedWith(
        "Token index out of range",
      )
    })

    it("Reverts with 'Cannot swap more than you own'", async () => {
      await expect(
        swap.connect(user1).swap(0, 1, MAX_UINT256, 0, MAX_UINT256),
      ).to.be.revertedWith("Cannot swap more than you own")
    })

    it("Succeeds with expected swap amounts", async () => {
      // User 1 calculates how much token to receive
      const calculatedSwapReturn = await swap.calculateSwap(0, 1, String(1e17))
      expect(calculatedSwapReturn).to.eq(BigNumber.from("99702611562565289"))

      const [
        tokenFromBalanceBefore,
        tokenToBalanceBefore,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

      // User 1 successfully initiates swap
      await swap
        .connect(user1)
        .swap(0, 1, String(1e17), calculatedSwapReturn, MAX_UINT256)

      // Check the sent and received amounts are as expected
      const [
        tokenFromBalanceAfter,
        tokenToBalanceAfter,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])
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
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

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
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

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

    it("Returns correct amount of received token", async () => {
      await swap.disableGuard()
      await firstToken.mint(testSwapReturnValues.address, String(1e20))
      await secondToken.mint(testSwapReturnValues.address, String(1e20))
      await testSwapReturnValues.test_addLiquidity(
        [String(1e18), String(2e18)],
        0,
        [],
      )
      await testSwapReturnValues.test_swap(0, 1, String(1e18), 0)
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
    beforeEach(async () => {
      await swap.disableGuard()
    })
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
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
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
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      expect(await swap.getVirtualPrice()).to.eq(BigNumber.from(String(1e18)))

      // pool changes to 2:1 ratio, thus changing the virtual price
      await swap
        .connect(user2)
        .addLiquidity([String(2e18), String(0)], 0, MAX_UINT256, [])
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
      // User 2 makes balanced deposit, keeping the ratio 2:1
      await swap
        .connect(user2)
        .addLiquidity([String(2e18), String(1e18)], 0, MAX_UINT256, [])
      expect(await swap.getVirtualPrice()).to.eq(
        BigNumber.from("1000167146429977312"),
      )
    })

    it("Value is unchanged after balanced withdrawals", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
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
    it("Reverts with 'Token index out of range'", async () => {
      await expect(swap.getAdminBalance(3)).to.be.revertedWith(
        "Token index out of range",
      )
    })

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
    beforeEach(async () => {
      await swap.disableGuard()
    })

    it("Reverts when called by non-owners", async () => {
      await expect(swap.connect(user1).withdrawAdminFees()).to.be.reverted
      await expect(swap.connect(user2).withdrawAdminFees()).to.be.reverted
    })

    it("Succeeds when there are no fees withdrawn", async () => {
      // Sets adminFee to 1% of the swap fees
      await swap.setAdminFee(BigNumber.from(10 ** 8))

      const [
        firstTokenBefore,
        secondTokenBefore,
      ] = await getUserTokenBalances(owner, [firstToken, secondToken])

      await swap.withdrawAdminFees()

      const [
        firstTokenAfter,
        secondTokenAfter,
      ] = await getUserTokenBalances(owner, [firstToken, secondToken])

      expect(firstTokenBefore).to.eq(firstTokenAfter)
      expect(secondTokenBefore).to.eq(secondTokenAfter)
    })

    it("Succeeds with expected amount of fees withdrawn", async () => {
      // Sets adminFee to 1% of the swap fees
      await swap.setAdminFee(BigNumber.from(10 ** 8))
      await swap.connect(user1).swap(0, 1, String(1e17), 0, MAX_UINT256)
      await swap.connect(user1).swap(1, 0, String(1e17), 0, MAX_UINT256)

      expect(await swap.getAdminBalance(0)).to.eq(String(1001973776101))
      expect(await swap.getAdminBalance(1)).to.eq(String(998024139765))

      const [
        firstTokenBefore,
        secondTokenBefore,
      ] = await getUserTokenBalances(owner, [firstToken, secondToken])

      await swap.withdrawAdminFees()

      const [
        firstTokenAfter,
        secondTokenAfter,
      ] = await getUserTokenBalances(owner, [firstToken, secondToken])

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
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])

      for (let i = 0; i < 10; i++) {
        await swap.connect(user2).swap(0, 1, String(1e17), 0, MAX_UINT256)
        await swap.connect(user2).swap(1, 0, String(1e17), 0, MAX_UINT256)
      }

      await swap.withdrawAdminFees()

      const [
        firstTokenBefore,
        secondTokenBefore,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

      const user1LPTokenBalance = await swapToken.balanceOf(user1Address)
      await swapToken.connect(user1).approve(swap.address, user1LPTokenBalance)
      await swap
        .connect(user1)
        .removeLiquidity(user1LPTokenBalance, [0, 0], MAX_UINT256)

      const [
        firstTokenAfter,
        secondTokenAfter,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

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
      await expect(swap.connect(user1).disableGuard()).to.be.reverted
      await swap.connect(owner).disableGuard()
      expect(await swap.isGuarded()).to.eq(false)
    })

    it("addLiquidity with empty merkle proof reverts", async () => {
      await expect(
        swap
          .connect(user1)
          .addLiquidity([String(1e18), String(3e18)], 0, MAX_UINT256, []),
      ).to.be.reverted
    })

    describe("addLiquidity", () => {
      it("Succeeds with valid address and valid proof", async () => {
        await swap
          .connect(user1)
          .addLiquidity(
            [String(1e18), String(3e18)],
            0,
            MAX_UINT256,
            getTestMerkleProof(user1Address),
          )

        expect(await swapToken.balanceOf(user1Address)).to.eq(
          "3991672211258372957",
        )
      })

      it("Succeeds even when pool is not guarded", async () => {
        await swap.disableGuard()
        await swap
          .connect(user1)
          .addLiquidity(
            [String(1e18), String(3e18)],
            0,
            MAX_UINT256,
            getTestMerkleProof(user1Address),
          )

        expect(await swapToken.balanceOf(user1Address)).to.eq(
          "3991672211258372957",
        )
      })

      it("Ignores merkle proof when pool is not guarded", async () => {
        await swap.disableGuard()
        await swap
          .connect(user1)
          .addLiquidity([String(1e18), String(3e18)], 0, MAX_UINT256, [])

        expect(await swapToken.balanceOf(user1Address)).to.eq(
          "3991672211258372957",
        )
      })

      it("Reverts with valid address but invalid proof", async () => {
        await expect(
          swap
            .connect(user1)
            .addLiquidity(
              [String(1e18), String(3e18)],
              0,
              MAX_UINT256,
              getTestMerkleProof(user2Address),
            ),
        ).to.be.reverted
      })

      it("Reverts with invalid address", async () => {
        const notAllowedUser = signers[10]

        await firstToken.mint(await notAllowedUser.getAddress(), String(1e18))
        await secondToken.mint(await notAllowedUser.getAddress(), String(3e18))

        await firstToken
          .connect(notAllowedUser)
          .approve(swap.address, MAX_UINT256)
        await secondToken
          .connect(notAllowedUser)
          .approve(swap.address, MAX_UINT256)

        await expect(
          swap
            .connect(notAllowedUser)
            .addLiquidity(
              [String(1e18), String(3e18)],
              0,
              MAX_UINT256,
              getTestMerkleProof(user1Address),
            ),
        ).to.be.reverted

        await expect(
          swap
            .connect(notAllowedUser)
            .addLiquidity([String(1e18), String(3e18)], 0, MAX_UINT256, []),
        ).to.be.reverted
      })

      it("Reverts when depositing over individual limit", async () => {
        const tokenAmount = BigNumber.from(10).pow(22)

        await firstToken.mint(user1Address, tokenAmount)
        await secondToken.mint(user1Address, tokenAmount)

        await expect(
          swap
            .connect(user1)
            .addLiquidity(
              [tokenAmount, tokenAmount],
              0,
              MAX_UINT256,
              getTestMerkleProof(user1Address),
            ),
        ).to.be.revertedWith("account deposit limit")
      })

      it("Reverts when depositing over pool cap", async () => {
        await allowlist.setPoolCap(swap.address, String(1e17))

        expect(await allowlist.getPoolAccountLimit(swap.address)).to.eq(
          String(2e20),
        )

        await expect(
          swap
            .connect(user1)
            .addLiquidity(
              [String(1e18), String(1e18)],
              0,
              MAX_UINT256,
              getTestMerkleProof(user1Address),
            ),
        ).to.be.reverted
      })
    })

    it("LP Token minting and burning works as expected", async () => {
      await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), String(3e18)],
          0,
          MAX_UINT256,
          getTestMerkleProof(user1Address),
        )
      expect(await swapToken.balanceOf(user1Address)).to.eq(
        "3991672211258372957",
      )

      await swap
        .connect(user1)
        .removeLiquidity("3991672211258372957", [0, 0], MAX_UINT256)
      expect(await swapToken.balanceOf(user1Address)).to.eq("0")
      expect(await firstToken.balanceOf(user1Address)).to.eq(
        "100332406737390609241",
      )
      expect(await secondToken.balanceOf(user1Address)).to.eq(
        "99664813474781218483",
      )
    })
  })

  describe("Test withdrawal fees on removeLiquidity", () => {
    beforeEach(async () => {
      expect(await swapToken.balanceOf(user1Address)).to.eq(0)
      await swap.setDefaultWithdrawFee(String(5e7))
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)
      await swap.disableGuard()
    })

    it("Removing liquidity immediately after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])

      const currentPoolTokenBalance = await swapToken.balanceOf(user1Address)

      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const expectedTokenAmounts = await swap.calculateRemoveLiquidity(
        user1Address,
        currentPoolTokenBalance,
      )
      expect(expectedTokenAmounts[0]).to.eq("995000000000000000")
      expect(expectedTokenAmounts[1]).to.eq("995000000000000000")

      const expectedTokenAmountsWithoutWithdrawalFee = await swap.calculateRemoveLiquidity(
        ZERO_ADDRESS,
        currentPoolTokenBalance,
      )
      expect(expectedTokenAmountsWithoutWithdrawalFee[0]).to.eq(String(1e18))
      expect(expectedTokenAmountsWithoutWithdrawalFee[1]).to.eq(String(1e18))

      const [
        firstBalanceBefore,
        secondBalanceBefore,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

      // Manually set the timestamp between addLiquidity and removeLiquidity to 1 second
      await setNextTimestamp(depositTimestamp + 1)
      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [
        firstBalanceAfter,
        secondBalanceAfter,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

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
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])

      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const [
        firstBalanceBefore,
        secondBalanceBefore,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])
      const currentPoolTokenBalance = await swapToken.balanceOf(user1Address)

      // 2 weeks = 2 * 604800 seconds
      await setTimestamp(depositTimestamp + 2 * TIME.WEEKS - 1)

      const expectedTokenAmounts = await swap.calculateRemoveLiquidity(
        user1Address,
        currentPoolTokenBalance,
      )
      expect(expectedTokenAmounts[0]).to.eq("997499998000000000")
      expect(expectedTokenAmounts[1]).to.eq("997499998000000000")

      const expectedTokenAmountsWithoutWithdrawalFee = await swap.calculateRemoveLiquidity(
        ZERO_ADDRESS,
        currentPoolTokenBalance,
      )
      expect(expectedTokenAmountsWithoutWithdrawalFee[0]).to.eq(String(1e18))
      expect(expectedTokenAmountsWithoutWithdrawalFee[1]).to.eq(String(1e18))

      await setNextTimestamp(depositTimestamp + 2 * TIME.WEEKS)
      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [
        firstBalanceAfter,
        secondBalanceAfter,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

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
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])

      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const [
        firstBalanceBefore,
        secondBalanceBefore,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

      const currentPoolTokenBalance = await swapToken.balanceOf(user1Address)

      // 4 weeks = 4 * 604800 seconds
      await setTimestamp(depositTimestamp + 4 * TIME.WEEKS)
      const expectedTokenAmounts = await swap.calculateRemoveLiquidity(
        user1Address,
        currentPoolTokenBalance,
      )
      expect(expectedTokenAmounts[0]).to.eq(String(1e18))
      expect(expectedTokenAmounts[1]).to.eq(String(1e18))

      const expectedTokenAmountsWithoutWithdrawalFee = await swap.calculateRemoveLiquidity(
        ZERO_ADDRESS,
        currentPoolTokenBalance,
      )
      expect(expectedTokenAmountsWithoutWithdrawalFee[0]).to.eq(String(1e18))
      expect(expectedTokenAmountsWithoutWithdrawalFee[1]).to.eq(String(1e18))

      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [
        firstBalanceAfter,
        secondBalanceAfter,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

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
      await swap.disableGuard()
      await swap.addLiquidity([String(1e19), String(1e19)], 0, MAX_UINT256, [])
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)
    })

    it("Removing liquidity immediately after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const firstBalanceBefore = await getUserTokenBalance(user1, firstToken)
      const swapTokenBalance = await getUserTokenBalance(user1, swapToken)

      const expectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        user1Address,
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmount).to.eq("1987041984559878425")

      const expectedFirstTokenAmountWithoutWithdrawalFee = await swap.calculateRemoveLiquidityOneToken(
        ZERO_ADDRESS,
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmountWithoutWithdrawalFee).to.eq(
        "1997027120160681835",
      )

      await setNextTimestamp(depositTimestamp + 1)
      await swap
        .connect(user1)
        .removeLiquidityOneToken(swapTokenBalance, 0, 0, MAX_UINT256)

      const firstBalanceAfter = await getUserTokenBalance(user1, firstToken)

      // Close to 1987041984559878425
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "1987041988753635378",
      )
    })

    it("Removing liquidity 2 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const [
        firstBalanceBefore,
        swapTokenBalance,
      ] = await getUserTokenBalances(user1, [firstToken, swapToken])

      const initiallyExpectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        user1Address,
        swapTokenBalance,
        0,
      )
      expect(initiallyExpectedFirstTokenAmount).to.eq("1987041984559878425")

      const expectedFirstTokenAmountWithoutWithdrawalFee = await swap.calculateRemoveLiquidityOneToken(
        ZERO_ADDRESS,
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmountWithoutWithdrawalFee).to.eq(
        "1997027120160681835",
      )

      await setTimestamp(depositTimestamp + 2 * TIME.WEEKS - 1)

      const expectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        user1Address,
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmount).to.eq("1992034548366225890")

      await setNextTimestamp(depositTimestamp + 2 * TIME.WEEKS)

      await swap
        .connect(user1)
        .removeLiquidityOneToken(swapTokenBalance, 0, 0, MAX_UINT256)

      const firstBalanceAfter = await getUserTokenBalance(user1, firstToken)

      // 1997027120160681835 * 99.75% = 1992034552360280130
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "1992034552360280130",
      )
    })

    it("Removing liquidity 4 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const [
        firstBalanceBefore,
        swapTokenBalance,
      ] = await getUserTokenBalances(user1, [firstToken, swapToken])

      const initiallyExpectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        user1Address,
        swapTokenBalance,
        0,
      )
      expect(initiallyExpectedFirstTokenAmount).to.eq("1987041984559878425")

      const expectedFirstTokenAmountWithoutWithdrawalFee = await swap.calculateRemoveLiquidityOneToken(
        ZERO_ADDRESS,
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmountWithoutWithdrawalFee).to.eq(
        "1997027120160681835",
      )

      await setTimestamp(depositTimestamp + 4 * TIME.WEEKS)

      const expectedFirstTokenAmount = await swap.calculateRemoveLiquidityOneToken(
        user1Address,
        swapTokenBalance,
        0,
      )
      expect(expectedFirstTokenAmount).to.eq("1997027120160681835")

      await swap
        .connect(user1)
        .removeLiquidityOneToken(swapTokenBalance, 0, 0, MAX_UINT256)

      const firstBalanceAfter = await getUserTokenBalance(user1, firstToken)

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
      await swap.disableGuard()
      await swap.addLiquidity([String(1e19), String(1e19)], 0, MAX_UINT256, [])
      await swapToken.connect(user1).approve(swap.address, MAX_UINT256)
    })

    it("Removing liquidity immediately after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const [
        firstTokenBefore,
        secondTokenBefore,
        swapTokenBefore,
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

      const expectedBurnAmount = await swap.calculateTokenAmount(
        user1Address,
        [String(1e18), String(1e17)],
        false,
      )
      expect(expectedBurnAmount).to.eq("1105910196876519474")

      const expectedBurnAmountWithoutWithdrawalFee = await swap.calculateTokenAmount(
        ZERO_ADDRESS,
        [String(1e18), String(1e17)],
        false,
      )
      expect(expectedBurnAmountWithoutWithdrawalFee).to.eq(
        "1100380645892136877",
      )

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
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1e18))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(String(1e17))

      // Below comparison with defaultWithdrawFee set to zero results in 1100830653956319289
      // Total amount of burned token should be close to
      // 1100830653956319289 / 0.995

      // Actual amount burned / expected amount burned = 1.00040895461
      expect(swapTokenBefore.sub(swapTokenAfter)).to.eq("1106362463952721723")
    })

    it("Removing liquidity 2 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const [
        firstTokenBefore,
        secondTokenBefore,
        swapTokenBefore,
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

      await setTimestamp(depositTimestamp + 2 * TIME.WEEKS - 1)

      const expectedBurnAmount = await swap.calculateTokenAmount(
        user1Address,
        [String(1e18), String(1e17)],
        false,
      )
      expect(expectedBurnAmount).to.eq("1103138494334249489")

      const expectedBurnAmountWithoutWithdrawalFee = await swap.calculateTokenAmount(
        ZERO_ADDRESS,
        [String(1e18), String(1e17)],
        false,
      )
      expect(expectedBurnAmountWithoutWithdrawalFee).to.eq(
        "1100380645892136877",
      )

      await setNextTimestamp(depositTimestamp + 2 * TIME.WEEKS)
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
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1e18))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(String(1e17))

      // 1100830653956319289 / 0.9975 = 1103589628026385252
      // Actual amount burned / expected amount burned = 1.00040895472
      expect(swapTokenBefore.sub(swapTokenAfter)).to.eq("1103589628026385252")
    })

    it("Removing liquidity 4 weeks after deposit", async () => {
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      const [
        firstTokenBefore,
        secondTokenBefore,
        swapTokenBefore,
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

      await setTimestamp(depositTimestamp + 4 * TIME.WEEKS)

      const expectedBurnAmount = await swap.calculateTokenAmount(
        user1Address,
        [String(1e18), String(1e17)],
        false,
      )
      expect(expectedBurnAmount).to.eq("1100380645892136877")

      const expectedBurnAmountWithoutWithdrawalFee = await swap.calculateTokenAmount(
        ZERO_ADDRESS,
        [String(1e18), String(1e17)],
        false,
      )
      expect(expectedBurnAmountWithoutWithdrawalFee).to.eq(
        "1100380645892136877",
      )

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
      ] = await getUserTokenBalances(user1, [
        firstToken,
        secondToken,
        swapToken,
      ])

      expect(firstTokenAfter.sub(firstTokenBefore)).to.eq(String(1e18))
      expect(secondTokenAfter.sub(secondTokenBefore)).to.eq(String(1e17))

      // 1100830653956319289 / 1.0000 = 1100830653956319289
      // Actual amount burned / expected amount burned = 1.00040895672
      expect(swapTokenBefore.sub(swapTokenAfter)).to.eq("1100830653956319289")
    })
  })

  describe("Verify changing withdraw fee works as expected", async () => {
    // This test ensures that changing withdraw fee impacts deposits made in the past
    //
    // [Cases when withdraw fee is increased]
    // - When fee is increased from 0
    // Current balance and last deposit time is used for fee calculation.
    // Therefore the fee decays from full amount since the last deposit.
    // If the last deposit was more than 4 weeks prior to the fee increase, fee should be 0.
    //
    // - When fee is increased from x% to y%, where x > 0
    // Discounts from past deposits should apply accordingly and total fee should increase by rate of (y/x).
    //
    // [Cases when withdraw fee is decreased]
    // - When fee is decreased to 0
    // Fee should be 0 regardless when the user last deposited.
    //
    // - When fee is decreased from x% to y%, where y > 0
    // Discounts from past deposits should apply accordingly and total fee should decrease by rate of (y/x).

    beforeEach(async () => {
      await swap.disableGuard()
    })

    it("Increase withdraw fee from 0% to 0.5%, immediately after last deposit", async () => {
      // User 2 adds liquidity once when fee is 0%
      await swap
        .connect(user2)
        .addLiquidity(
          [String(1e18), String(1e18)],
          0,
          (await getCurrentBlockTimestamp()) + 60,
          [],
        )
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)

      // User 2 adds liquidity again at 2 weeks time
      const nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 2
      await setNextTimestamp(nextTimestamp)
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, nextTimestamp + 60, [])
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)

      // Fee is updated to 0.5%
      await swap.setDefaultWithdrawFee(String(5e7))

      // Fee should linearly decay from 0.5% to 0% since the last deposit
      // (Fee is bit less than 0.5% because `swap.setDefaultWithdrawFee` is called one block after the last deposit)
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        49999979,
      )

      // 2 weeks pass
      // Fee should be around 2.5e7
      await setTimestamp((await getCurrentBlockTimestamp()) + TIME.WEEKS * 2)
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        24999979,
      )
    })

    it("Increase withdraw fee from 0% to 0.5%, 2 weeks after last deposit", async () => {
      // User 2 adds liquidity once when fee is 0%
      await swap
        .connect(user2)
        .addLiquidity(
          [String(1e18), String(1e18)],
          0,
          (await getCurrentBlockTimestamp()) + 60,
          [],
        )
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)

      // User 2 adds liquidity again at 2 weeks time
      let nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 2
      await setNextTimestamp(nextTimestamp)
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, nextTimestamp + 60, [])
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)

      // After 2 weeks since last deposit Fee is updated to 0.5%
      nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 2
      await setNextTimestamp(nextTimestamp)
      await swap.setDefaultWithdrawFee(String(5e7))

      // Since 2 weeks is already past, fee should linearly decay from 0.25% to 0% over 2 weeks
      // Fee should start aat 0.25% and decay to 0% linearly over the next 2 weeks
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        25000000,
      )

      // 2 weeks pass
      // Fee should be 0
      await setTimestamp((await getCurrentBlockTimestamp()) + TIME.WEEKS * 2)
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)
    })

    it("Increase withdraw fee from 0% to 0.5%, 4 weeks after last deposit", async () => {
      // User 2 adds liquidity once when fee is 0%
      await swap
        .connect(user2)
        .addLiquidity(
          [String(1e18), String(1e18)],
          0,
          (await getCurrentBlockTimestamp()) + 60,
          [],
        )
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)

      // User 2 adds liquidity again at 2 weeks time
      let nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 2
      await setNextTimestamp(nextTimestamp)
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, nextTimestamp + 60, [])
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)

      // After 4 weeks since last deposit, fee is updated to 0.5%
      nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 4
      await setNextTimestamp(nextTimestamp)
      await swap.setDefaultWithdrawFee(String(5e7))

      // Since 4 weeks is already past since last deposit, fee should be 0.
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)
    })

    it("Increase withdraw fee from 0.5% to 1%", async () => {
      await swap.setDefaultWithdrawFee(String(5e7))

      // User 2 adds liquidity once when fee is 0.5%
      await swap
        .connect(user2)
        .addLiquidity(
          [String(1e18), String(1e18)],
          0,
          (await getCurrentBlockTimestamp()) + 60,
          [],
        )
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        50000000,
      )

      // User 2 adds liquidity again at 2 weeks time
      // First deposit is discounted to half. Full fee is applied to second deposit
      // Total withdraw fee should come out to 0.375%
      // ((1e18 * 0.25%) + (1e18 * 0.5%)) / 2e18 = 0.375%
      const nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 2
      await setNextTimestamp(nextTimestamp)
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, nextTimestamp + 60, [])
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        37500000,
      )

      // Fee is updated to 1%
      // Same math should apply as before but with base fee of 1%
      // ((1e18 * 0.5%) + (1e18 * 1%)) / 2e18 = 0.75%
      await swap.setDefaultWithdrawFee(String(1e8))
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        74999968,
      )

      // 2 weeks pass
      // Fee should be around 2.5e7
      await setTimestamp((await getCurrentBlockTimestamp()) + TIME.WEEKS * 2)
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        37499968,
      )
    })

    it("Decrease withdraw fee from 0.5% to 0%", async () => {
      await swap.setDefaultWithdrawFee(String(5e7))

      // User 2 adds liquidity once when fee is 0.5%
      await swap
        .connect(user2)
        .addLiquidity(
          [String(1e18), String(1e18)],
          0,
          (await getCurrentBlockTimestamp()) + 60,
          [],
        )
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        50000000,
      )

      // User 2 adds liquidity again at 2 weeks time
      // First deposit is discounted to half. Full fee is applied to second deposit
      // Total withdraw fee should come out to 0.375%
      // ((1e18 * 0.25%) + (1e18 * 0.5%)) / 2e18 = 0.375%
      const nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 2
      await setNextTimestamp(nextTimestamp)
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, nextTimestamp + 60, [])
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        37500000,
      )

      // Fee is updated to 0%
      await swap.setDefaultWithdrawFee(String(0))
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)

      // 2 weeks pass
      await setTimestamp((await getCurrentBlockTimestamp()) + TIME.WEEKS * 2)
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)
    })

    it("Decrease withdraw fee from 1% to 0.5%", async () => {
      await swap.setDefaultWithdrawFee(String(1e8))

      // User 2 adds liquidity once when fee is 1%
      await swap
        .connect(user2)
        .addLiquidity(
          [String(1e18), String(1e18)],
          0,
          (await getCurrentBlockTimestamp()) + 60,
          [],
        )
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        100000000,
      )

      // User 2 adds liquidity again at 2 weeks time
      // First deposit is discounted to half. Full fee is applied to second deposit
      // Total withdraw fee should come out to 0.75%
      // ((1e18 * 0.5%) + (1e18 * 1%)) / 2e18 = 0.75%
      const nextTimestamp = (await getCurrentBlockTimestamp()) + TIME.WEEKS * 2
      await setNextTimestamp(nextTimestamp)
      await swap
        .connect(user2)
        .addLiquidity([String(1e18), String(1e18)], 0, nextTimestamp + 60, [])
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        75000000,
      )

      // Fee is decreased to 0.5%
      // Fee should decrease by half
      await swap.setDefaultWithdrawFee(String(5e7))
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        37499984,
      )

      // 2 weeks pass
      await setTimestamp((await getCurrentBlockTimestamp()) + TIME.WEEKS * 2)
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(
        18749984,
      )

      // 2 weeks pass. This is 4 weeks mark since last deposit. Fee should be 0.
      await setTimestamp((await getCurrentBlockTimestamp()) + TIME.WEEKS * 2)
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.be.eq(0)
    })
  })

  describe("updateUserWithdrawFee", async () => {
    beforeEach(async () => {
      await swap.disableGuard()
    })
    it("Reverts with 'Only callable by pool token'", async () => {
      await expect(
        swap.connect(user1).updateUserWithdrawFee(ZERO_ADDRESS, String(5e7)),
      ).to.be.revertedWith("Only callable by pool token")
    })

    it("Test adding liquidity, and once again at 2 weeks mark then removing all deposits at 4 weeks mark", async () => {
      await swap.setDefaultWithdrawFee(String(5e7))
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      // 2 weeks after
      await setNextTimestamp(depositTimestamp + 2 * TIME.WEEKS)
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(2e18)], 0, MAX_UINT256, [])

      // At 2 weeks mark, half of first deposit's withdrawal fee is discounted, 0.25%.
      // We are adding twice the amount of first deposit at full withdrawal fee amount, 0.5%.
      // Remainder of the fees + new fees is then again stretched out to be discounted over the decay period (4 weeks)
      // (2e18 * 0.25% + 4e18 * 0.5%) / 6e18 = 0.41666666%
      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from("41666666"),
      )

      await swapToken
        .connect(user1)
        .approve(swap.address, await swapToken.balanceOf(user1Address))

      const [
        firstBalanceBefore,
        secondBalanceBefore,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])
      const currentPoolTokenBalance = await swapToken.balanceOf(user1Address)

      // 4 weeks after initial deposit
      await setNextTimestamp(depositTimestamp + 4 * TIME.WEEKS)
      await swap
        .connect(user1)
        .removeLiquidity(currentPoolTokenBalance, [0, 0], MAX_UINT256)

      const [
        firstBalanceAfter,
        secondBalanceAfter,
      ] = await getUserTokenBalances(user1, [firstToken, secondToken])

      // Returned amounts are (100 - 0.41666666 / 2) = 99.79166667% of total deposits
      // 3e18 * 99.79166667% = 2.9937500001e18
      expect(firstBalanceAfter.sub(firstBalanceBefore)).to.eq(
        "2993750000100000000",
      )
      expect(secondBalanceAfter.sub(secondBalanceBefore)).to.eq(
        "2993750000100000000",
      )
    })

    it("Verify withdraw fees are updated on transfer", async () => {
      await swap.setDefaultWithdrawFee(String(5e7))
      await swap
        .connect(user1)
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])
      const depositTimestamp = (
        await swap.getDepositTimestamp(user1Address)
      ).toNumber()

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      // 2 weeks after
      await setNextTimestamp(depositTimestamp + 2 * TIME.WEEKS)
      await swap
        .connect(user1)
        .addLiquidity([String(2e18), String(2e18)], 0, MAX_UINT256, [])

      // At 2 weeks mark, half of first deposit's withdrawal fee is discounted, 0.25%.
      // We are adding twice the amount of first deposit at full withdrawal fee amount, 0.5%.
      // Remainder of the fees + new fees is then again stretched out to be discounted over the decay period (4 weeks)
      // (2e18 * 0.25% + 4e18 * 0.5%) / 6e18 = 0.41666666%
      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from("41666666"),
      )

      // Transfer some of swap token from user1 to user2
      await swapToken.connect(user1).transfer(user2Address, String(1e18))

      // Verify user1's fee has not changed
      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from("41666649"),
      )

      // Verify user2's fee is set to default value
      expect(await swap.calculateCurrentWithdrawFee(user2Address)).to.eq(
        BigNumber.from("50000000"),
      )

      await setTimestamp((await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS)

      // Verify user2's fee decays as expected
      let currentFee = await swap.calculateCurrentWithdrawFee(user2Address)
      expect(currentFee).to.lte(BigNumber.from("25000000"))
      expect(currentFee).to.gte(BigNumber.from("24993778"))

      // Transfer more tokens to user2
      await swapToken.connect(user1).transfer(user2Address, String(1e18))

      // Verify user2's fee has updated with discounted rate
      currentFee = await swap.calculateCurrentWithdrawFee(user2Address)
      expect(currentFee).to.lte(BigNumber.from("37499989"))
      expect(currentFee).to.gte(BigNumber.from("37497044"))
    })
  })

  describe("setDefaultWithdrawFee", () => {
    beforeEach(async () => {
      await swap.disableGuard()
    })
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
        .addLiquidity([String(1e18), String(1e18)], 0, MAX_UINT256, [])

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(5e7),
      )

      await swap.setDefaultWithdrawFee(String(0))

      expect(await swap.calculateCurrentWithdrawFee(user1Address)).to.eq(
        BigNumber.from(0),
      )
    })

    it("Reverts when fee is too high", async () => {
      await expect(swap.setDefaultWithdrawFee(String(15e8))).to.be.reverted
    })
  })

  describe("rampA", () => {
    beforeEach(async () => {
      await swap.disableGuard()
    })
    it("Emits RampA event", async () => {
      await expect(
        swap.rampA(
          100,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        ),
      ).to.emit(swap, "RampA")
    })

    it("Succeeds to ramp upwards", async () => {
      // Create imbalanced pool to measure virtual price change
      // We expect virtual price to increase as A decreases
      await swap.addLiquidity([String(1e18), 0], 0, MAX_UINT256, [])

      // call rampA(), changing A to 100 within a span of 14 days
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
      await swap.rampA(100, endTimestamp)

      // +0 seconds since ramp A
      expect(await swap.getA()).to.be.eq(50)
      expect(await swap.getAPrecise()).to.be.eq(5000)
      expect(await swap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await swap.getA()).to.be.eq(54)
      expect(await swap.getAPrecise()).to.be.eq(5413)
      expect(await swap.getVirtualPrice()).to.be.eq("1000258443200231295")

      // set timestamp to the end of ramp period
      await setTimestamp(endTimestamp)
      expect(await swap.getA()).to.be.eq(100)
      expect(await swap.getAPrecise()).to.be.eq(10000)
      expect(await swap.getVirtualPrice()).to.be.eq("1000771363829405068")
    })

    it("Succeeds to ramp downwards", async () => {
      // Create imbalanced pool to measure virtual price change
      // We expect virtual price to decrease as A decreases
      await swap.addLiquidity([String(1e18), 0], 0, MAX_UINT256, [])

      // call rampA()
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1
      await swap.rampA(25, endTimestamp)

      // +0 seconds since ramp A
      expect(await swap.getA()).to.be.eq(50)
      expect(await swap.getAPrecise()).to.be.eq(5000)
      expect(await swap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await swap.getA()).to.be.eq(47)
      expect(await swap.getAPrecise()).to.be.eq(4794)
      expect(await swap.getVirtualPrice()).to.be.eq("1000115870150391894")

      // set timestamp to the end of ramp period
      await setTimestamp(endTimestamp)
      expect(await swap.getA()).to.be.eq(25)
      expect(await swap.getAPrecise()).to.be.eq(2500)
      expect(await swap.getVirtualPrice()).to.be.eq("998999574522335473")
    })

    it("Reverts when non-owner calls it", async () => {
      await expect(
        swap
          .connect(user1)
          .rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.reverted
    })

    it("Reverts with 'Wait 1 day before starting ramp'", async () => {
      await swap.rampA(
        55,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )
      await expect(
        swap.rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.revertedWith("Wait 1 day before starting ramp")
    })

    it("Reverts with 'Insufficient ramp time'", async () => {
      await expect(
        swap.rampA(55, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS - 1),
      ).to.be.revertedWith("Insufficient ramp time")
    })

    it("Reverts with 'futureA_ must be > 0 and < MAX_A'", async () => {
      await expect(
        swap.rampA(0, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.revertedWith("futureA_ must be > 0 and < MAX_A")
    })

    it("Reverts with 'futureA_ is too small'", async () => {
      await expect(
        swap.rampA(24, (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1),
      ).to.be.revertedWith("futureA_ is too small")
    })

    it("Reverts with 'futureA_ is too large'", async () => {
      await expect(
        swap.rampA(
          101,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        ),
      ).to.be.revertedWith("futureA_ is too large")
    })
  })

  describe("stopRampA", () => {
    it("Emits StopRampA event", async () => {
      // call rampA()
      await swap.rampA(
        100,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100,
      )

      // Stop ramp
      expect(swap.stopRampA()).to.emit(swap, "StopRampA")
    })

    it("Stop ramp succeeds", async () => {
      // call rampA()
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100
      await swap.rampA(100, endTimestamp)

      // set timestamp to +100000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await swap.getA()).to.be.eq(54)
      expect(await swap.getAPrecise()).to.be.eq(5413)

      // Stop ramp
      await swap.stopRampA()
      expect(await swap.getA()).to.be.eq(54)
      expect(await swap.getAPrecise()).to.be.eq(5413)

      // set timestamp to endTimestamp
      await setTimestamp(endTimestamp)

      // verify ramp has stopped
      expect(await swap.getA()).to.be.eq(54)
      expect(await swap.getAPrecise()).to.be.eq(5413)
    })

    it("Reverts with 'Ramp is already stopped'", async () => {
      // call rampA()
      const endTimestamp =
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 100
      await swap.rampA(100, endTimestamp)

      // set timestamp to +10000 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 100000)
      expect(await swap.getA()).to.be.eq(54)
      expect(await swap.getAPrecise()).to.be.eq(5413)

      // Stop ramp
      await swap.stopRampA()
      expect(await swap.getA()).to.be.eq(54)
      expect(await swap.getAPrecise()).to.be.eq(5413)

      // check call reverts when ramp is already stopped
      await expect(swap.stopRampA()).to.be.revertedWith(
        "Ramp is already stopped",
      )
    })
  })

  describe("Check for timestamp manipulations", () => {
    beforeEach(async () => {
      await swap.disableGuard()
    })
    it("Check for maximum differences in A and virtual price when A is increasing", async () => {
      // Create imbalanced pool to measure virtual price change
      // Sets the pool in 2:1 ratio where firstToken is significantly cheaper than secondToken
      await swap.addLiquidity([String(1e18), 0], 0, MAX_UINT256, [])

      // Initial A and virtual price
      expect(await swap.getA()).to.be.eq(50)
      expect(await swap.getAPrecise()).to.be.eq(5000)
      expect(await swap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // Start ramp
      await swap.rampA(
        100,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900)

      expect(await swap.getA()).to.be.eq(50)
      expect(await swap.getAPrecise()).to.be.eq(5003)
      expect(await swap.getVirtualPrice()).to.be.eq("1000167862696363286")

      // Max increase of A between two blocks
      // 5003 / 5000
      // = 1.0006

      // Max increase of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
      // 1000167862696363286 / 1000167146429977312
      // = 1.00000071615
    })

    it("Check for maximum differences in A and virtual price when A is decreasing", async () => {
      // Create imbalanced pool to measure virtual price change
      // Sets the pool in 2:1 ratio where firstToken is significantly cheaper than secondToken
      await swap.addLiquidity([String(1e18), 0], 0, MAX_UINT256, [])

      // Initial A and virtual price
      expect(await swap.getA()).to.be.eq(50)
      expect(await swap.getAPrecise()).to.be.eq(5000)
      expect(await swap.getVirtualPrice()).to.be.eq("1000167146429977312")

      // Start ramp
      await swap.rampA(
        25,
        (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
      )

      // Malicious miner skips 900 seconds
      await setTimestamp((await getCurrentBlockTimestamp()) + 900)

      expect(await swap.getA()).to.be.eq(49)
      expect(await swap.getAPrecise()).to.be.eq(4999)
      expect(await swap.getVirtualPrice()).to.be.eq("1000166907487883089")

      // Max decrease of A between two blocks
      // 4999 / 5000
      // = 0.9998

      // Max decrease of virtual price between two blocks (at 2:1 ratio of tokens, starting A = 50)
      // 1000166907487883089 / 1000167146429977312
      // = 0.99999976109
    })

    // Below tests try to verify the issues found in Curve Vulnerability Report are resolved.
    // https://medium.com/@peter_4205/curve-vulnerability-report-a1d7630140ec
    // The two cases we are most concerned are:
    //
    // 1. A is ramping up, and the pool is at imbalanced state.
    //
    // Attacker can 'resolve' the imbalance prior to the change of A. Then try to recreate the imbalance after A has
    // changed. Due to the price curve becoming more linear, recreating the imbalance will become a lot cheaper. Thus
    // benefiting the attacker.
    //
    // 2. A is ramping down, and the pool is at balanced state
    //
    // Attacker can create the imbalance in token balances prior to the change of A. Then try to resolve them
    // near 1:1 ratio. Since downward change of A will make the price curve less linear, resolving the token balances
    // to 1:1 ratio will be cheaper. Thus benefiting the attacker
    //
    // For visual representation of how price curves differ based on A, please refer to Figure 1 in the above
    // Curve Vulnerability Report.

    describe("Check for attacks while A is ramping upwards", () => {
      let initialAttackerBalances: BigNumber[] = []
      let initialPoolBalances: BigNumber[] = []
      let attacker: Signer

      beforeEach(async () => {
        // This attack is achieved by creating imbalance in the first block then
        // trading in reverse direction in the second block.
        attacker = user1

        initialAttackerBalances = await getUserTokenBalances(attacker, [
          firstToken,
          secondToken,
        ])

        expect(initialAttackerBalances[0]).to.be.eq(String(1e20))
        expect(initialAttackerBalances[1]).to.be.eq(String(1e20))

        // Start ramp upwards
        await swap.rampA(
          100,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        )
        expect(await swap.getAPrecise()).to.be.eq(5000)

        // Check current pool balances
        initialPoolBalances = [
          await swap.getTokenBalance(0),
          await swap.getTokenBalance(1),
        ]
        expect(initialPoolBalances[0]).to.be.eq(String(1e18))
        expect(initialPoolBalances[1]).to.be.eq(String(1e18))
      })

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          it("Attack fails with 900 seconds between blocks", async () => {
            // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of secondToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
            // firstToken balance in the pool  : 2.00e18
            // secondToken balance in the pool : 9.14e16
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq("91408257454997694")

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await swap.getAPrecise()).to.be.eq(5003)

            // Trade secondToken to firstToken, taking advantage of the imbalance and change of A
            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("997214696574405737")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("2785303425594263")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 2.785e15 firstToken (0.2785% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = []
            finalPoolBalances.push(await swap.getTokenBalance(0))
            finalPoolBalances.push(await swap.getTokenBalance(1))

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "2785303425594263",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 2.785e15 firstToken (0.2785% of firstToken balance)
            // The attack did not benefit the attacker.
          })

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of secondToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
            // firstToken balance in the pool  : 2.00e18
            // secondToken balance in the pool : 9.14e16
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq("91408257454997694")

            // Assume no transactions occur during 2 weeks
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await swap.getAPrecise()).to.be.eq(10000)

            // Trade secondToken to firstToken, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("955743484403042509")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("44256515596957491")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 4.426e16 firstToken (4.426%)

            // Check for pool balance changes
            const finalPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "44256515596957491",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 4.426e16 firstToken (4.426% of firstToken balance of the pool)
            // The attack did not benefit the attacker.
          })
        },
      )

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          beforeEach(async () => {
            // Set up pool to be imbalanced prior to the attack
            await swap
              .connect(user2)
              .addLiquidity(
                [String(0), String(2e18)],
                0,
                (await getCurrentBlockTimestamp()) + 60,
                [],
              )

            // Check current pool balances
            initialPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]
            expect(initialPoolBalances[0]).to.be.eq(String(1e18))
            expect(initialPoolBalances[1]).to.be.eq(String(3e18))
          })

          it("Attack fails with 900 seconds between blocks", async () => {
            // Swap 1e18 of firstToken to secondToken, resolving imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 1.012e18 of secondToken
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 secondToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // firstToken balance in the pool  : 2.000e18
            // secondToken balance in the pool : 1.988e18
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed upwards
            // 5000 -> 5003 (0.06%)
            expect(await swap.getAPrecise()).to.be.eq(5003)

            // Trade secondToken to firstToken, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the attacker leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("998017518949630644")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("1982481050369356")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 1.982e15 firstToken (0.1982% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = []
            finalPoolBalances.push(await swap.getTokenBalance(0))
            finalPoolBalances.push(await swap.getTokenBalance(1))

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "1982481050369356",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 1.982e15 firstToken (0.1982% of firstToken balance)
            // The attack did not benefit the attacker.
          })

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping up.
            // Purpose of this test case is to mimic rapid ramp up of A.

            // Swap 1e18 of firstToken to secondToken, resolving the imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of secondToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // firstToken balance in the pool  : 2.000e18
            // secondToken balance in the pool : 1.988e18
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Assume 2 weeks go by without any other transactions
            // This mimics rapid change of A
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed upwards
            // 5000 -> 10000 (100%)
            expect(await swap.getAPrecise()).to.be.eq(10000)

            // Trade secondToken to firstToken, taking advantage of the imbalance and sudden change of A
            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("1004298818514364451")
            // Attack was successful!

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            expect(initialAttackerBalances[0]).to.be.lt(
              finalAttackerBalances[0],
            )
            expect(initialAttackerBalances[1]).to.be.eq(
              finalAttackerBalances[1],
            )
            expect(
              finalAttackerBalances[0].sub(initialAttackerBalances[0]),
            ).to.be.eq("4298818514364451")
            expect(
              finalAttackerBalances[1].sub(initialAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker gained 4.430e15 firstToken (0.430%)

            // Check for pool balance changes
            const finalPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq(
              "4298818514364451",
            )
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) lost 4.430e15 firstToken (0.430% of firstToken balance)

            // The attack benefited the attacker.
            // Note that this attack is only possible when there are no swaps happening during the 2 weeks ramp period.
          })
        },
      )
    })

    describe("Check for attacks while A is ramping downwards", () => {
      let initialAttackerBalances: BigNumber[] = []
      let initialPoolBalances: BigNumber[] = []
      let attacker: Signer

      beforeEach(async () => {
        // Set up the downward ramp A
        attacker = user1

        initialAttackerBalances = await getUserTokenBalances(attacker, [
          firstToken,
          secondToken,
        ])

        expect(initialAttackerBalances[0]).to.be.eq(String(1e20))
        expect(initialAttackerBalances[1]).to.be.eq(String(1e20))

        // Start ramp downwards
        await swap.rampA(
          25,
          (await getCurrentBlockTimestamp()) + 14 * TIME.DAYS + 1,
        )
        expect(await swap.getAPrecise()).to.be.eq(5000)

        // Check current pool balances
        initialPoolBalances = [
          await swap.getTokenBalance(0),
          await swap.getTokenBalance(1),
        ]
        expect(initialPoolBalances[0]).to.be.eq(String(1e18))
        expect(initialPoolBalances[1]).to.be.eq(String(1e18))
      })

      describe(
        "When tokens are priced equally: " +
          "attacker creates massive imbalance prior to A change, and resolves it after",
        () => {
          // This attack is achieved by creating imbalance in the first block then
          // trading in reverse direction in the second block.

          it("Attack fails with 900 seconds between blocks", async () => {
            // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of secondToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
            // firstToken balance in the pool  : 2.00e18
            // secondToken balance in the pool : 9.14e16
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq("91408257454997694")

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed downwards
            expect(await swap.getAPrecise()).to.be.eq(4999)

            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("997276754500361021")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("2723245499638979")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 2.723e15 firstToken (0.2723% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "2723245499638979",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 2.723e15 firstToken (0.2723% of firstToken balance)
            // The attack did not benefit the attacker.
          })

          it("Attack succeeds with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test is to show how dangerous rapid A ramp is.

            // Swap 1e18 of firstToken to secondToken, causing massive imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 9.085e17 of secondToken
            expect(secondTokenOutput).to.be.eq("908591742545002306")

            // Pool is imbalanced! Now trades from secondToken -> firstToken may be profitable in small sizes
            // firstToken balance in the pool  : 2.00e18
            // secondToken balance in the pool : 9.14e16
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq("91408257454997694")

            // Assume no transactions occur during 2 weeks ramp time
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed downwards
            expect(await swap.getAPrecise()).to.be.eq(2500)

            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("1066252480054180588")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.gt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              finalAttackerBalances[0].sub(initialAttackerBalances[0]),
            ).to.be.eq("66252480054180588")
            expect(
              finalAttackerBalances[1].sub(initialAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker gained 6.625e16 firstToken (6.625% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.lt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(initialPoolBalances[0].sub(finalPoolBalances[0])).to.be.eq(
              "66252480054180588",
            )
            expect(initialPoolBalances[1].sub(finalPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) lost 6.625e16 firstToken (6.625% of firstToken balance)

            // The attack was successful. The change of A (-50%) gave the attacker a chance to swap
            // more efficiently. The swap fee (0.1%) was not sufficient to counter the efficient trade, giving
            // the attacker more tokens than initial deposit.
          })
        },
      )

      describe(
        "When token price is unequal: " +
          "attacker 'resolves' the imbalance prior to A change, then recreates the imbalance.",
        () => {
          beforeEach(async () => {
            // Set up pool to be imbalanced prior to the attack
            await swap
              .connect(user2)
              .addLiquidity(
                [String(0), String(2e18)],
                0,
                (await getCurrentBlockTimestamp()) + 60,
                [],
              )

            // Check current pool balances
            initialPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]
            expect(initialPoolBalances[0]).to.be.eq(String(1e18))
            expect(initialPoolBalances[1]).to.be.eq(String(3e18))
          })

          it("Attack fails with 900 seconds between blocks", async () => {
            // Swap 1e18 of firstToken to secondToken, resolving imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 1.012e18 of secondToken
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 secondToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // firstToken balance in the pool  : 2.000e18
            // secondToken balance in the pool : 1.988e18
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Malicious miner skips 900 seconds
            await setTimestamp((await getCurrentBlockTimestamp()) + 900)

            // Verify A has changed downwards
            expect(await swap.getAPrecise()).to.be.eq(4999)

            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("998007711333645455")

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("1992288666354545")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 1.992e15 firstToken (0.1992% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "1992288666354545",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 1.992e15 firstToken (0.1992% of firstToken balance)
            // The attack did not benefit the attacker.
          })

          it("Attack fails with 2 weeks between transactions (mimics rapid A change)", async () => {
            // This test assumes there are no other transactions during the 2 weeks period of ramping down.
            // Purpose of this test case is to mimic rapid ramp down of A.

            // Swap 1e18 of firstToken to secondToken, resolving imbalance in the pool
            await swap
              .connect(attacker)
              .swap(0, 1, String(1e18), 0, MAX_UINT256)
            const secondTokenOutput = (
              await getUserTokenBalance(attacker, secondToken)
            ).sub(initialAttackerBalances[1])

            // First trade results in 1.012e18 of secondToken
            // Because the pool was imbalanced in the beginning, this trade results in more than 1e18 secondToken
            expect(secondTokenOutput).to.be.eq("1011933251060681353")

            // Pool is now almost balanced!
            // firstToken balance in the pool  : 2.000e18
            // secondToken balance in the pool : 1.988e18
            expect(await swap.getTokenBalance(0)).to.be.eq(String(2e18))
            expect(await swap.getTokenBalance(1)).to.be.eq(
              "1988066748939318647",
            )

            // Assume no other transactions occur during the 2 weeks ramp period
            await setTimestamp(
              (await getCurrentBlockTimestamp()) + 2 * TIME.WEEKS,
            )

            // Verify A has changed downwards
            expect(await swap.getAPrecise()).to.be.eq(2500)

            const balanceBefore = await getUserTokenBalance(
              attacker,
              firstToken,
            )
            await swap
              .connect(attacker)
              .swap(1, 0, secondTokenOutput, 0, MAX_UINT256)
            const firstTokenOutput = (
              await getUserTokenBalance(attacker, firstToken)
            ).sub(balanceBefore)

            // If firstTokenOutput > 1e18, the malicious user leaves with more firstToken than the start.
            expect(firstTokenOutput).to.be.eq("986318317546604072")
            // Attack was not successful

            const finalAttackerBalances = await getUserTokenBalances(attacker, [
              firstToken,
              secondToken,
            ])

            // Check for attacker's balance changes
            expect(finalAttackerBalances[0]).to.be.lt(
              initialAttackerBalances[0],
            )
            expect(finalAttackerBalances[1]).to.be.eq(
              initialAttackerBalances[1],
            )
            expect(
              initialAttackerBalances[0].sub(finalAttackerBalances[0]),
            ).to.be.eq("13681682453395928")
            expect(
              initialAttackerBalances[1].sub(finalAttackerBalances[1]),
            ).to.be.eq("0")
            // Attacker lost 1.368e16 firstToken (1.368% of initial deposit)

            // Check for pool balance changes
            const finalPoolBalances = [
              await swap.getTokenBalance(0),
              await swap.getTokenBalance(1),
            ]

            expect(finalPoolBalances[0]).to.be.gt(initialPoolBalances[0])
            expect(finalPoolBalances[1]).to.be.eq(initialPoolBalances[1])
            expect(finalPoolBalances[0].sub(initialPoolBalances[0])).to.be.eq(
              "13681682453395928",
            )
            expect(finalPoolBalances[1].sub(initialPoolBalances[1])).to.be.eq(
              "0",
            )
            // Pool (liquidity providers) gained 1.368e16 firstToken (1.368% of firstToken balance)
            // The attack did not benefit the attacker
          })
        },
      )
    })
  })
})
