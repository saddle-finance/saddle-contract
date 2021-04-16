import { Signer, Wallet } from "ethers"
import { ZERO_ADDRESS, deployContractWithLibraries } from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"
import { deployments, ethers } from "hardhat"

import { GenericERC20 } from "../build/typechain/GenericERC20"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/contracts/MathUtils.sol/MathUtils.json"
import { Swap } from "../build/typechain/Swap"
import SwapArtifact from "../build/artifacts/contracts/Swap.sol/Swap.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/contracts/SwapUtils.sol/SwapUtils.json"
import chai from "chai"

chai.use(solidity)
const { expect } = chai

describe("Swap", () => {
  let signers: Array<Signer>
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let swap: Swap
  let firstToken: GenericERC20
  let secondToken: GenericERC20
  let owner: Signer

  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { get } = deployments
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]

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

      swap = (await deployContractWithLibraries(owner, SwapArtifact, {
        SwapUtils: (await get("SwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      })) as Swap
      await swap.deployed()
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("swapStorage#constructor", () => {
    it("Reverts with '_pooledTokens.length <= 1'", async () => {
      await expect(
        swap.initialize(
          [],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          0,
        ),
      ).to.be.revertedWith("_pooledTokens.length <= 1")
    })

    it("Reverts with '_pooledTokens.length > 32'", async () => {
      await expect(
        swap.initialize(
          Array(33).fill(firstToken.address),
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          0,
        ),
      ).to.be.revertedWith("_pooledTokens.length > 32")
    })

    it("Reverts with '_pooledTokens decimals mismatch'", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, secondToken.address],
          [18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          0,
        ),
      ).to.be.revertedWith("_pooledTokens decimals mismatch")
    })

    it("Reverts with 'Duplicate tokens'", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, firstToken.address],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          0,
        ),
      ).to.be.revertedWith("Duplicate tokens")
    })

    it("Reverts with 'The 0 address isn't an ERC-20'", async () => {
      await expect(
        swap.initialize(
          [ZERO_ADDRESS, ZERO_ADDRESS],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          0,
        ),
      ).to.be.revertedWith("The 0 address isn't an ERC-20")
    })

    it("Reverts with 'Token decimals exceeds max'", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, secondToken.address],
          [19, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          0,
        ),
      ).to.be.revertedWith("Token decimals exceeds max")
    })

    it("Reverts with '_a exceeds maximum'", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, secondToken.address],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          10e6 + 1,
          SWAP_FEE,
          0,
          0,
        ),
      ).to.be.revertedWith("_a exceeds maximum")
    })

    it("Reverts with '_fee exceeds maximum'", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, secondToken.address],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          10e8 + 1,
          0,
          0,
        ),
      ).to.be.revertedWith("_fee exceeds maximum")
    })

    it("Reverts with '_adminFee exceeds maximum'", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, secondToken.address],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          10e10 + 1,
          0,
        ),
      ).to.be.revertedWith("_adminFee exceeds maximum")
    })

    it("Reverts with '_withdrawFee exceeds maximum'", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, secondToken.address],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          10e8 + 1,
        ),
      ).to.be.revertedWith("_withdrawFee exceeds maximum")
    })
  })
})
