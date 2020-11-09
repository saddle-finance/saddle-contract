import { BigNumber, Signer, Wallet } from "ethers"
import {
  MAX_UINT256,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
  getTokenBalance,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/Allowlist.json"
import LPTokenArtifact from "../build/artifacts/LPToken.json"
import { LpToken } from "../build/typechain/LpToken"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { Swap } from "../build/typechain/Swap"
import SwapArtifact from "../build/artifacts/Swap.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/SwapUtils.json"
import chai from "chai"
import { ethers } from "@nomiclabs/buidler"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
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
    A: BigNumber
    swapFee: BigNumber
    adminFee: BigNumber
    lpToken: string
    "0": BigNumber
    "1": BigNumber
    "2": BigNumber
    "3": BigNumber
    "4": string
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

    // Mint dummy tokens
    await DAI.mint(ownerAddress, String(1e20))
    await USDC.mint(ownerAddress, String(1e8))
    await USDT.mint(ownerAddress, String(1e8))
    await SUSD.mint(ownerAddress, String(1e20))

    await DAI.mint(user1Address, String(1e20))
    await USDC.mint(user1Address, String(1e8))
    await USDT.mint(user1Address, String(1e8))
    await SUSD.mint(user1Address, String(1e20))

    await DAI.mint(user2Address, String(1e20))
    await USDC.mint(user2Address, String(1e8))
    await USDT.mint(user2Address, String(1e8))
    await SUSD.mint(user2Address, String(1e20))

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

    // Populate the pool with initial liquidity
    await DAI.approve(swap.address, MAX_UINT256)
    await USDC.approve(swap.address, MAX_UINT256)
    await USDT.approve(swap.address, MAX_UINT256)
    await SUSD.approve(swap.address, MAX_UINT256)

    await swap.addLiquidity(
      [String(50e18), String(50e6), String(50e6), String(50e18)],
      0,
      MAX_UINT256,
    )

    expect(await swap.getTokenBalance(0)).to.be.eq(String(50e18))
    expect(await swap.getTokenBalance(1)).to.be.eq(String(50e6))
    expect(await swap.getTokenBalance(2)).to.be.eq(String(50e6))
    expect(await swap.getTokenBalance(3)).to.be.eq(String(50e18))
    expect(await getTokenBalance(owner, swapToken)).to.be.eq(String(200e18))
  })

  describe("addLiquidity", () => {
    it("Add liquidity suceeds with pool with 4 tokens", async () => {
      const calcTokenAmount = await swap.calculateTokenAmount(
        [String(1e18), 0, 0, 0],
        true,
      )
      expect(calcTokenAmount).to.be.eq("999854620735777893")
      await swap.addLiquidity(
        [String(1e18), 0, 0, 0],
        calcTokenAmount.mul(99).div(100),
        (await getCurrentBlockTimestamp()) + 60,
      )
    })
  })

  describe("swap", () => {
    it("Swap works between tokens with different decimals", async () => {
      const calcTokenAmount = await swap
        .connect(user1)
        .calculateSwap(2, 0, String(1e6))
      expect(calcTokenAmount).to.be.eq("998608238366733809")
      const DAIBefore = await getTokenBalance(user1, DAI)
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
      const DAIAfter = await getTokenBalance(user1, DAI)
      expect(DAIAfter.sub(DAIBefore)).to.be.eq(calcTokenAmount)
    })
  })
})
