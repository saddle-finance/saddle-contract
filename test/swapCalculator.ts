import { ContractFactory, Signer } from "ethers"
import { solidity } from "ethereum-waffle"

import { SwapCalculator } from "../build/typechain/"

import chai from "chai"
import { deployments } from "hardhat"
import { BIG_NUMBER_1E18 } from "./testUtils"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

describe("SwapCalculator", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let swapCalculator: SwapCalculator
  let factory: ContractFactory

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      factory = await ethers.getContractFactory("SwapCalculator")
      swapCalculator = (await factory.deploy()) as SwapCalculator
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("calculateSwapOutput", () => {
    it("Reverts when minting 0", async () => {
      // Deploy dummy tokens
      const expectedOutput = await swapCalculator.calculateSwapOutput(
        [BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18],
        10000,
        4e6,
        0,
        1,
        "500000000000000000",
      )
      expect(expectedOutput).to.eq("496554001417813317")
    })
  })

  describe("calculateSwapInput", () => {
    it("Reverts when minting 0", async () => {
      // Deploy dummy tokens
      const expectedInput = await swapCalculator.calculateSwapInput(
        [BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18, BIG_NUMBER_1E18],
        10000,
        4e6,
        0,
        1,
        "500000000000000000",
      )
      expect(expectedInput).to.eq(0)
    })
  })
})
