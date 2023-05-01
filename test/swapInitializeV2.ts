import chai from "chai"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import { GenericERC20, SwapV2, AmplificationUtilsV2, LPTokenV2, SwapUtilsV2 } from "../build/typechain"
import { ZERO_ADDRESS, deployContractWithLibraries } from "./testUtils"
import SwapV2Artifact from "../build/artifacts/contracts/SwapV2.sol/SwapV2.json"

const { expect } = chai

describe("SwapV2 Initialize", () => {
  let signers: Array<Signer>
  let swap: SwapV2
  let lpTokenV2: LPTokenV2
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
      await deployments.fixture(["Swap"]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]

      // Deploy dummy tokens
      const erc20Factory = await ethers.getContractFactory("GenericERC20")

      firstToken = (await erc20Factory.deploy(
        "First Token",
        "FIRST",
        "18",
      )) as GenericERC20

      secondToken = (await erc20Factory.deploy(
        "Second Token",
        "SECOND",
        "18",
      )) as GenericERC20

      // Deploy Swap Libraries
      const amplificationUtilsV2 = (await (
        await ethers.getContractFactory("AmplificationUtilsV2")
      ).deploy()) as AmplificationUtilsV2
      await amplificationUtilsV2.deployed()
      const swapUtilsV2 = (await (
        await ethers.getContractFactory("SwapUtilsV2")
      ).deploy()) as SwapUtilsV2
      await swapUtilsV2.deployed()
      lpTokenV2 = ( await (
        await ethers.getContractFactory("LPTokenV2")
      ).deploy()) as LPTokenV2


      // Swap Contract
      swap = (await deployContractWithLibraries(owner, SwapV2Artifact, {
        SwapUtilsV2: swapUtilsV2.address,
        AmplificationUtilsV2: amplificationUtilsV2.address,
      })) as SwapV2
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
          lpTokenV2.address,
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
          lpTokenV2.address,
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
          lpTokenV2.address,
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
          lpTokenV2.address,
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
          lpTokenV2.address,
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
          lpTokenV2.address,
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
          lpTokenV2.address,
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
          lpTokenV2.address,
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
          lpTokenV2.address,
        ),
      ).to.be.revertedWith("_adminFee exceeds maximum")
    })

    it("Reverts when the LPToken target does not implement initialize function", async () => {
      await expect(
        swap.initialize(
          [firstToken.address, secondToken.address],
          [18, 18],
          LP_TOKEN_NAME,
          LP_TOKEN_SYMBOL,
          INITIAL_A_VALUE,
          SWAP_FEE,
          0,
          ZERO_ADDRESS,
        ),
      ).to.be.revertedWithoutReason()
    })
  })
})
