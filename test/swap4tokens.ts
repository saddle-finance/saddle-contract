import { BigNumber, Signer, Wallet } from "ethers"
import {
  MAX_UINT256,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
  getUserTokenBalance,
  asyncForEach,
  getUserTokenBalances,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import { Erc20 as ERC20 } from "../build/typechain/Erc20"
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

describe("Swap with 4 tokens", () => {
  let signers: Array<Signer>
  let swap: Swap
  let allowlist: Allowlist
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let DAI: LpToken
  let USDC: LpToken
  let USDT: LpToken
  let SUSD: LpToken
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
  const TOKENS: ERC20[] = []

  beforeEach(async () => {
    TOKENS.length = 0
    signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]
    ownerAddress = await owner.getAddress()
    user1Address = await user1.getAddress()
    user2Address = await user2.getAddress()

    // Deploy dummy tokens
    DAI = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "DAI",
      "DAI",
      "18",
    ])) as LpToken

    USDC = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "USDC",
      "USDC",
      "6",
    ])) as LpToken

    USDT = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "USDT",
      "USDT",
      "6",
    ])) as LpToken

    SUSD = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "SUSD",
      "SUSD",
      "18",
    ])) as LpToken

    TOKENS.push(DAI, USDC, USDT, SUSD)

    // Mint dummy tokens
    await asyncForEach(
      [ownerAddress, user1Address, user2Address],
      async (address) => {
        await DAI.mint(address, String(1e20))
        await USDC.mint(address, String(1e8))
        await USDT.mint(address, String(1e8))
        await SUSD.mint(address, String(1e20))
      },
    )

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
        [DAI.address, USDC.address, USDT.address, SUSD.address],
        [String(1e18), String(1e6), String(1e6), String(1e18)],
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
    )) as LpToken

    // Set deposit limits
    allowlist.setPoolCap(swap.address, BigNumber.from(10).pow(18).mul(6000000))
    allowlist.setPoolAccountLimit(
      swap.address,
      BigNumber.from(10).pow(18).mul(1000000),
    )
    allowlist.setMultipliers(
      [ownerAddress, user1Address, user2Address],
      [1000, 1000, 1000],
    )

    await asyncForEach([owner, user1, user2], async (signer) => {
      await DAI.connect(signer).approve(swap.address, MAX_UINT256)
      await USDC.connect(signer).approve(swap.address, MAX_UINT256)
      await USDT.connect(signer).approve(swap.address, MAX_UINT256)
      await SUSD.connect(signer).approve(swap.address, MAX_UINT256)
    })

    // Populate the pool with initial liquidity
    await swap.addLiquidity(
      [String(50e18), String(50e6), String(50e6), String(50e18)],
      0,
      MAX_UINT256,
    )

    expect(await swap.getTokenBalance(0)).to.be.eq(String(50e18))
    expect(await swap.getTokenBalance(1)).to.be.eq(String(50e6))
    expect(await swap.getTokenBalance(2)).to.be.eq(String(50e6))
    expect(await swap.getTokenBalance(3)).to.be.eq(String(50e18))
    expect(await getUserTokenBalance(owner, swapToken)).to.be.eq(String(200e18))
  })

  describe("addLiquidity", () => {
    it("Add liquidity succeeds with pool with 4 tokens", async () => {
      const calcTokenAmount = await swap.calculateTokenAmount(
        [String(1e18), 0, 0, 0],
        true,
      )
      expect(calcTokenAmount).to.be.eq("999854620735777893")

      // Add liquidity as user1
      await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), 0, 0, 0],
          calcTokenAmount.mul(99).div(100),
          (await getCurrentBlockTimestamp()) + 60,
        )

      // Verify swapToken balance
      expect(await swapToken.balanceOf(await user1.getAddress())).to.be.eq(
        "999355335447632820",
      )
    })
  })

  describe("swap", () => {
    it("Swap works between tokens with different decimals", async () => {
      const calcTokenAmount = await swap
        .connect(user1)
        .calculateSwap(2, 0, String(1e6))
      expect(calcTokenAmount).to.be.eq("998608238366733809")
      const DAIBefore = await getUserTokenBalance(user1, DAI)
      await USDT.connect(user1).approve(swap.address, String(1e6))
      await swap
        .connect(user1)
        .swap(
          2,
          0,
          String(1e6),
          calcTokenAmount,
          (await getCurrentBlockTimestamp()) + 60,
        )
      const DAIAfter = await getUserTokenBalance(user1, DAI)

      // Verify user1 balance changes
      expect(DAIAfter.sub(DAIBefore)).to.be.eq("998608238366733809")

      // Verify pool balance changes
      expect(await swap.getTokenBalance(0)).to.be.eq("49001391761633266191")
    })
  })

  describe("removeLiquidity", () => {
    it("Remove Liquidity succeeds", async () => {
      const calcTokenAmount = await swap.calculateTokenAmount(
        [String(1e18), 0, 0, 0],
        true,
      )
      expect(calcTokenAmount).to.be.eq("999854620735777893")

      // Add liquidity (1e18 DAI) as user1
      await swap
        .connect(user1)
        .addLiquidity(
          [String(1e18), 0, 0, 0],
          calcTokenAmount.mul(99).div(100),
          (await getCurrentBlockTimestamp()) + 60,
        )

      // Verify swapToken balance
      expect(await swapToken.balanceOf(await user1.getAddress())).to.be.eq(
        "999355335447632820",
      )

      // Calculate expected amounts of tokens user1 will recieve
      const expectedAmounts = await swap.calculateRemoveLiquidity(
        "999355335447632820",
      )

      expect(expectedAmounts[0]).to.be.eq("253568584947798923")
      expect(expectedAmounts[1]).to.be.eq("248596")
      expect(expectedAmounts[2]).to.be.eq("248596")
      expect(expectedAmounts[3]).to.be.eq("248596651909606787")

      // Allow burn of swapToken
      await swapToken.connect(user1).approve(swap.address, "999355335447632820")
      const beforeTokenBalances = await getUserTokenBalances(user1, TOKENS)

      // Withdraw user1's share via all tokens in proportion to pool's balances
      await swap
        .connect(user1)
        .removeLiquidity(
          "999355335447632820",
          expectedAmounts,
          (await getCurrentBlockTimestamp()) + 60,
        )

      const afterTokenBalances = await getUserTokenBalances(user1, TOKENS)

      // Verify the received amounts are correct
      expect(afterTokenBalances[0].sub(beforeTokenBalances[0])).to.be.eq(
        "253568584947798923",
      )
      expect(afterTokenBalances[1].sub(beforeTokenBalances[1])).to.be.eq(
        "248596",
      )
      expect(afterTokenBalances[2].sub(beforeTokenBalances[2])).to.be.eq(
        "248596",
      )
      expect(afterTokenBalances[3].sub(beforeTokenBalances[3])).to.be.eq(
        "248596651909606787",
      )
    })
  })
})
