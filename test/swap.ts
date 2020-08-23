import { ethers } from "@nomiclabs/buidler"
import { Wallet, Signer } from "ethers"
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"

import SwapUtilsArtifact from "../build/artifacts/SwapUtils.json"
import { SwapUtils } from "../build/typechain/SwapUtils"

import SwapArtifact from "../build/artifacts/Swap.json"
import { Swap } from "../build/typechain/Swap"

import ERC20Artifact from "../build/artifacts/ERC20.json"
import { Erc20 as ERC20 } from "../build/typechain/Erc20"

import MathUtilsArtifact from "../build/artifacts/MathUtils.json"
import { MathUtils } from "../build/typechain/MathUtils"

import { linkBytecode } from "./testUtils"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
  let signers: Array<Signer>
  let swap: Swap
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let erc20Token1: ERC20
  let erc20Token2: ERC20

  beforeEach(async () => {
    signers = await ethers.getSigners()

    // Deploy dummy tokens
    erc20Token1 = (await deployContract(signers[0] as Wallet, ERC20Artifact, [
      "First Token",
      "FIRST",
    ])) as ERC20

    erc20Token2 = (await deployContract(signers[0] as Wallet, ERC20Artifact, [
      "Second Token",
      "SECOND",
    ])) as ERC20

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

    swap = (await swapFactory.deploy(
      [erc20Token1.address, erc20Token2.address],
      [String(1e18), String(1e18)],
      "LP Token Name",
      "LP",
      50,
      String(1e7),
    )) as Swap

    await swap.deployed()
  })

  describe("getA", () => {
    it("getA returns correct value", async () => {
      expect(await swap.getA()).to.eq(50)
    })
  })
})
