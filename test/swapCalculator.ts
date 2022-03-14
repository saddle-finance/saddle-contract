import { BigNumber, ContractFactory, Signer } from "ethers"
import { solidity } from "ethereum-waffle"

import { Swap, SwapCalculator, GenericERC20 } from "../build/typechain/"

import chai from "chai"
import { deployments } from "hardhat"
import { asyncForEach, BIG_NUMBER_1E18, MAX_UINT256 } from "./testUtils"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

describe("SwapCalculator", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let swapCalculator: SwapCalculator
  let swap: Swap
  let tokens: GenericERC20[]
  let factory: ContractFactory

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      factory = await ethers.getContractFactory("SwapCalculator")

      swapCalculator = (await factory.deploy()) as SwapCalculator

      swap = await ethers.getContract("SaddleUSDPoolV2")
      tokens = [
        await ethers.getContract("DAI"),
        await ethers.getContract("USDC"),
        await ethers.getContract("USDT"),
      ]

      await asyncForEach(tokens, async (token) => {
        await token.approve(swap.address, MAX_UINT256)
      })

      await swap.addLiquidity(
        [BIG_NUMBER_1E18, BigNumber.from(1e6), BigNumber.from(1e6)],
        0,
        MAX_UINT256,
      )

      await swapCalculator.addPool(swap.address)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("calculateSwapOutputCustom", () => {
    it("Successfully calculates exact outputs using manual pool params", async () => {
      // Deploy dummy tokens
      const expectedOutput =
        await swapCalculator.callStatic.calculateSwapOutputCustom(
          [BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18],
          20000, // 200 A
          4e6, // 4bps
          0,
          1,
          String(0.5e18),
        )
      expect(expectedOutput).to.eq("498155850119905812")
      expect(expectedOutput.div(String(1e12))).to.eq(
        await swap.calculateSwap(0, 1, String(0.5e18)),
      )
    })
  })

  describe("calculateSwapOutput", () => {
    it("Successfully calculates exact outputs using existing pool address", async () => {
      // Deploy dummy tokens
      const expectedOutput =
        await swapCalculator.callStatic.calculateSwapOutput(
          swap.address,
          0,
          1,
          String(0.5e18),
        )
      expect(expectedOutput).to.eq("498155")
      expect(expectedOutput).to.eq(
        await swap.calculateSwap(0, 1, String(0.5e18)),
      )
    })
  })

  describe("calculateSwapInputCustom", () => {
    it("Successfully calculates exact inputs using manual pool params", async () => {
      // Deploy dummy tokens
      const expectedInput =
        await swapCalculator.callStatic.calculateSwapInputCustom(
          [BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18],
          20000, // 200 A
          4e6, // 4bps
          0,
          1,
          "498155850119905812",
        )
      expect(expectedInput).to.eq(String(0.5e18))
    })
  })

  describe("calculateSwapInput", () => {
    it("Successfully calculates exact inputs using existing pool address", async () => {
      // Deploy dummy tokens
      const expectedInput = await swapCalculator.callStatic.calculateSwapInput(
        swap.address,
        0,
        1,
        "498155",
      )
      const estimatedGas = await swapCalculator.estimateGas.calculateSwapInput(
        swap.address,
        0,
        1,
        "498155",
      )
      console.log(`Estimated gas: ${estimatedGas}`)
      // 499999142075192543 is close enough to 0.5e18
      expect(expectedInput).to.eq("499999142075192543")
    })
  })
})
