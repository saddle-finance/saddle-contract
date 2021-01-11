import { Signer, Wallet } from "ethers"
import { ZERO_ADDRESS, deployContractWithLibraries } from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { Allowlist } from "../build/typechain/Allowlist"
import AllowlistArtifact from "../build/artifacts/contracts/Allowlist.sol/Allowlist.json"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import { GenericErc20 } from "../build/typechain/GenericErc20"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/contracts/MathUtils.sol/MathUtils.json"
import SwapArtifact from "../build/artifacts/contracts/Swap.sol/Swap.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/contracts/SwapUtils.sol/SwapUtils.json"
import chai from "chai"
import { ethers } from "hardhat"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
  let signers: Array<Signer>
  let allowlist: Allowlist
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let firstToken: GenericErc20
  let secondToken: GenericErc20
  let owner: Signer

  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"

  beforeEach(async () => {
    signers = await ethers.getSigners()
    owner = signers[0]

    // Deploy dummy tokens
    firstToken = (await deployContract(owner as Wallet, GenericERC20Artifact, [
      "First Token",
      "FIRST",
      "18",
    ])) as GenericErc20

    secondToken = (await deployContract(owner as Wallet, GenericERC20Artifact, [
      "Second Token",
      "SECOND",
      "18",
    ])) as GenericErc20

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
  })

  describe("swapStorage#constructor", () => {
    it("Reverts with 'Pools must contain more than 1 token'", async () => {
      await expect(
        deployContractWithLibraries(
          owner,
          SwapArtifact,
          { SwapUtils: swapUtils.address },
          [
            [],
            [18, 18],
            LP_TOKEN_NAME,
            LP_TOKEN_SYMBOL,
            INITIAL_A_VALUE,
            SWAP_FEE,
            0,
            0,
            allowlist.address,
          ],
        ),
      ).to.be.revertedWith("Pools must contain more than 1 token")
    })

    it("Reverts with 'Pools with over 32 tokens aren't supported'", async () => {
      await expect(
        deployContractWithLibraries(
          owner,
          SwapArtifact,
          { SwapUtils: swapUtils.address },
          [
            Array(33).fill(firstToken.address),
            [18, 18],
            LP_TOKEN_NAME,
            LP_TOKEN_SYMBOL,
            INITIAL_A_VALUE,
            SWAP_FEE,
            0,
            0,
            allowlist.address,
          ],
        ),
      ).to.be.revertedWith("Pools with over 32 tokens aren't supported")
    })

    it("Reverts with 'Each pooled token needs a specified precision'", async () => {
      await expect(
        deployContractWithLibraries(
          owner,
          SwapArtifact,
          { SwapUtils: swapUtils.address },
          [
            [firstToken.address, secondToken.address],
            [18],
            LP_TOKEN_NAME,
            LP_TOKEN_SYMBOL,
            INITIAL_A_VALUE,
            SWAP_FEE,
            0,
            0,
            allowlist.address,
          ],
        ),
      ).to.be.revertedWith("Each pooled token needs a specified decimals")
    })

    it("Reverts with 'Pools cannot have duplicate tokens'", async () => {
      await expect(
        deployContractWithLibraries(
          owner,
          SwapArtifact,
          { SwapUtils: swapUtils.address },
          [
            [firstToken.address, firstToken.address],
            [18, 18],
            LP_TOKEN_NAME,
            LP_TOKEN_SYMBOL,
            INITIAL_A_VALUE,
            SWAP_FEE,
            0,
            0,
            allowlist.address,
          ],
        ),
      ).to.be.revertedWith("Pools cannot have duplicate tokens")
    })

    it("Reverts with 'The 0 address isn't an ERC-20'", async () => {
      await expect(
        deployContractWithLibraries(
          owner,
          SwapArtifact,
          { SwapUtils: swapUtils.address },
          [
            [ZERO_ADDRESS, ZERO_ADDRESS],
            [18, 18],
            LP_TOKEN_NAME,
            LP_TOKEN_SYMBOL,
            INITIAL_A_VALUE,
            SWAP_FEE,
            0,
            0,
            allowlist.address,
          ],
        ),
      ).to.be.revertedWith("The 0 address isn't an ERC-20")
    })

    it("Reverts with 'Token decimals can't be higher than the pool's precision decimals'", async () => {
      await expect(
        deployContractWithLibraries(
          owner,
          SwapArtifact,
          { SwapUtils: swapUtils.address },
          [
            [firstToken.address, secondToken.address],
            [19, 18],
            LP_TOKEN_NAME,
            LP_TOKEN_SYMBOL,
            INITIAL_A_VALUE,
            SWAP_FEE,
            0,
            0,
            allowlist.address,
          ],
        ),
      ).to.be.revertedWith(
        "Token decimals can't be higher than the pool's precision decimals",
      )
    })
  })
})
