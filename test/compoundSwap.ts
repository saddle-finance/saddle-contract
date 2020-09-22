import { ethers } from "@nomiclabs/buidler"
import { deployContract, solidity } from "ethereum-waffle"

import chai from "chai"

import { BigNumber, Signer, Wallet } from "ethers"

import CTokenMockArtifact from "../build/artifacts/CTokenMock.json"
import { CTokenMock } from "../build/typechain/CTokenMock"

import SwapUtilsArtifact from "../build/artifacts/SwapUtils.json"
import { SwapUtils } from "../build/typechain/SwapUtils"

import CompoundSwapArtifact from "../build/artifacts/CompoundSwap.json"
import { CompoundSwap } from "../build/typechain/CompoundSwap"

import LPTokenArtifact from "../build/artifacts/LPToken.json"
import { LpToken } from "../build/typechain/LpToken"

import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { MathUtils } from "../build/typechain/MathUtils"

import { deployContractWithLibraries } from "./testUtils"

chai.use(solidity)
const { expect } = chai

async function makeToken(
  signer: Signer,
  name: string,
  symbol: string,
  decimals: number,
): Promise<LpToken> {
  return (await deployContract(signer, LPTokenArtifact, [
    name,
    symbol,
    decimals,
  ])) as LpToken
}

async function makeCToken(
  signer: Signer,
  name: string,
  symbol: string,
  decimals: number,
  underlying: string,
): Promise<CTokenMock> {
  return (await deployContract(signer, CTokenMockArtifact, [
    name,
    symbol,
    decimals,
    underlying,
  ])) as CTokenMock
}

describe("CompoundSwap", () => {
  let signers: Array<Signer>
  let owner: Signer
  let user1: Signer
  let user2: Signer

  let tokens: LpToken[]
  let cTokens: CTokenMock[]
  let compoundSwap: CompoundSwap

  // Test Values
  const RESERVE_RATIO = 10 ** 4
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"
  const CTOKEN_DECIMALS = 8
  const UNDERLYING_TOKEN_DECIMALS = [6, 6, 18, 18]

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]
    user1 = signers[1]
    user2 = signers[2]

    tokens = []
    cTokens = []

    // Create ERC20 tokens and cToken for each of them.
    for (let i = 0; i < 4; i++) {
      const decimals = UNDERLYING_TOKEN_DECIMALS[i]
      const token = await makeToken(owner, `Token${i}`, `TK${i}`, decimals)

      await token.mint(
        await owner.getAddress(),
        BigNumber.from(10).pow(decimals).mul(1000),
      )

      await token.mint(
        await user1.getAddress(),
        BigNumber.from(10).pow(decimals).mul(1000),
      )

      await token.mint(
        await user2.getAddress(),
        BigNumber.from(10).pow(decimals).mul(1000),
      )

      tokens.push(token)

      const cToken = await makeCToken(
        owner,
        `Compound Token${i}`,
        `cTK${i}`,
        CTOKEN_DECIMALS,
        token.address,
      )

      cTokens.push(cToken)
    }

    // Deploy MathUtils
    const mathUtils = (await deployContract(
      signers[0] as Wallet,
      MathUtilsArtifact,
    )) as MathUtils

    // Deploy SwapUtils with MathUtils library
    const swapUtils = (await deployContractWithLibraries(
      owner,
      SwapUtilsArtifact,
      {
        MathUtils: mathUtils.address,
      },
    )) as SwapUtils

    await swapUtils.deployed()

    const underlyingAddresses = tokens.map((t) => t.address)
    const cTokenAddresses = cTokens.map((c) => c.address)

    // Deploy CompoundSwap with SwapUtils library
    compoundSwap = (await deployContractWithLibraries(
      owner,
      CompoundSwapArtifact,
      { SwapUtils: swapUtils.address },
      [
        underlyingAddresses,
        UNDERLYING_TOKEN_DECIMALS,
        cTokenAddresses,
        RESERVE_RATIO,
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
      ],
    )) as CompoundSwap
    await compoundSwap.deployed()
  })

  describe("getToken()", () => {
    it("Returns correct addresses of pooled tokens", async () => {
      expect(await compoundSwap.getToken(0)).to.eq(tokens[0].address)
      expect(await compoundSwap.getToken(1)).to.eq(tokens[1].address)
      expect(await compoundSwap.getToken(2)).to.eq(tokens[2].address)
      expect(await compoundSwap.getToken(3)).to.eq(tokens[3].address)
    })

    it("Reverts when index is out of range", async () => {
      await expect(compoundSwap.getToken(4)).to.be.reverted
    })
  })

  describe("cTokens", async () => {
    it("Returns correct addresses of compound wrapped tokens", async () => {
      expect(await compoundSwap.cTokens(0)).to.eq(cTokens[0].address)
      expect(await compoundSwap.cTokens(1)).to.eq(cTokens[1].address)
      expect(await compoundSwap.cTokens(2)).to.eq(cTokens[2].address)
      expect(await compoundSwap.cTokens(3)).to.eq(cTokens[3].address)
    })

    it("Reverts when index is out of range", async () => {
      await expect(compoundSwap.cTokens(4)).to.be.reverted
    })
  })
})
