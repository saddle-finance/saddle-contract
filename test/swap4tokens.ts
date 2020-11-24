import { BigNumber, Signer, Wallet } from "ethers"
import {
  MAX_UINT256,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
  getTokenBalance,
  asyncForEach,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import { GenericErc20 } from "../build/typechain/GenericErc20"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
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
  let DAI: GenericErc20
  let USDC: GenericErc20
  let USDT: GenericErc20
  let SUSD: GenericErc20
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
    DAI = (await deployContract(owner as Wallet, GenericERC20Artifact, [
      "DAI",
      "DAI",
      "18",
    ])) as GenericErc20

    USDC = (await deployContract(owner as Wallet, GenericERC20Artifact, [
      "USDC",
      "USDC",
      "6",
    ])) as GenericErc20

    USDT = (await deployContract(owner as Wallet, GenericERC20Artifact, [
      "USDT",
      "USDT",
      "6",
    ])) as GenericErc20

    SUSD = (await deployContract(owner as Wallet, GenericERC20Artifact, [
      "SUSD",
      "SUSD",
      "18",
    ])) as GenericErc20

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
    expect(await getTokenBalance(owner, swapToken)).to.be.eq(String(200e18))
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
