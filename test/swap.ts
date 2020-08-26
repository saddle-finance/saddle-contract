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

import { linkBytecode } from "./testUtils"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
  let signers: Array<Signer>
  let swap: Swap
  let swapAsUser1: Swap
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let firstToken: LpToken
  let secondToken: LpToken
  let firstTokenAsUser1: LpToken
  let secondTokenAsUser1: LpToken
  let swapToken: LpToken
  let owner: Signer
  let user1: Signer

  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]

    // Deploy dummy tokens
    firstToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "First Token",
      "FIRST",
    ])) as LpToken

    secondToken = (await deployContract(owner as Wallet, LPTokenArtifact, [
      "Second Token",
      "SECOND",
    ])) as LpToken

    await firstToken.mint(await owner.getAddress(), String(1e20))
    await secondToken.mint(await owner.getAddress(), String(1e20))

    await firstToken.mint(await user1.getAddress(), String(1e20))
    await secondToken.mint(await user1.getAddress(), String(1e20))

    // Deploy MathUtils
    mathUtils = (await deployContract(
      signers[0] as Wallet,
      MathUtilsArtifact,
    )) as MathUtils

    // Link MathUtils Bytecode to SwapUtils
    const swapUtilsFactory = await ethers.getContractFactory(
      SwapUtilsArtifact.abi,
      linkBytecode(SwapUtilsArtifact, { MathUtils: mathUtils.address }),
    )

    swapUtils = (await swapUtilsFactory.deploy()) as SwapUtils
    await swapUtils.deployed()

    // Link SwapUtils Bytecode to Swap
    const swapFactory = await ethers.getContractFactory(
      SwapArtifact.abi,
      linkBytecode(SwapArtifact, { SwapUtils: swapUtils.address }),
    )

    // Deploy Swap contract
    swap = (await swapFactory.deploy(
      [firstToken.address, secondToken.address],
      [String(1e18), String(1e18)],
      "LP Token Name",
      "LP",
      INITIAL_A_VALUE,
      SWAP_FEE,
    )) as Swap

    await swap.deployed()

    swapToken = (await ethers.getContractAt(
      LPTokenArtifact.abi,
      (await swap.swapStorage()).lpToken,
    )) as LpToken

    // Populate the pool with initial liquidity
    await firstToken.approve(swap.address, ethers.constants.MaxUint256)
    await secondToken.approve(swap.address, ethers.constants.MaxUint256)
    await swap.addLiquidity([String(1e18), String(1e18)], 0)

    swapAsUser1 = swap.connect(user1 as Wallet)
    firstTokenAsUser1 = firstToken.connect(user1 as Wallet)
    secondTokenAsUser1 = secondToken.connect(user1 as Wallet)

    await firstTokenAsUser1.approve(
      swapAsUser1.address,
      ethers.constants.MaxUint256,
    )
    await secondTokenAsUser1.approve(
      swapAsUser1.address,
      ethers.constants.MaxUint256,
    )
  })

  describe("getA", () => {
    it("Returns correct value", async () => {
      expect(await swap.getA()).to.eq(INITIAL_A_VALUE)
    })
  })

  describe("addLiquidity", () => {
    it("Reverts when contract is paused", async () => {
      await swap.pause()

      expect(swapAsUser1.addLiquidity([String(2e18), String(1e16)], 0)).to.be
        .reverted
    })

    it("Succeeds with expected output amount of pool tokens", async () => {
      const calculatedPoolTokenAmount = await swapAsUser1.calculateTokenAmount(
        [String(1e18), String(3e18)],
        true,
      )

      const calculatedPoolTokenAmountWithSlippage = calculatedPoolTokenAmount
        .mul(999)
        .div(1000)

      await swapAsUser1.addLiquidity(
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
      const calculatedPoolTokenAmount = await swapAsUser1.calculateTokenAmount(
        [String(1e18), String(3e18)],
        true,
      )

      const calculatedPoolTokenAmountWithNegativeSlippage = calculatedPoolTokenAmount
        .mul(999)
        .div(1000)

      const calculatedPoolTokenAmountWithPositiveSlippage = calculatedPoolTokenAmount
        .mul(1001)
        .div(1000)

      await swapAsUser1.addLiquidity(
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

    it("Reverts when minToMint is not reached due to front running", async () => {
      const calculatedLPTokenAmount = await swapAsUser1.calculateTokenAmount(
        [String(1e18), String(3e18)],
        true,
      )

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      // Someone else deposits thus front running user 1's deposit
      await swap.addLiquidity([String(1e18), String(3e18)], 0)

      expect(
        swapAsUser1.addLiquidity(
          [String(1e18), String(3e18)],
          calculatedLPTokenAmountWithSlippage,
        ),
      ).to.be.reverted
    })

    it("Emits addLiquidity event", async () => {
      const calculatedLPTokenAmount = await swapAsUser1.calculateTokenAmount(
        [String(2e18), String(1e16)],
        true,
      )

      const calculatedLPTokenAmountWithSlippage = calculatedLPTokenAmount
        .mul(999)
        .div(1000)

      expect(
        swapAsUser1.addLiquidity(
          [String(2e18), String(1e16)],
          calculatedLPTokenAmountWithSlippage,
        ),
      ).to.emit(swapAsUser1, "AddLiquidity")
    })
  })
})
