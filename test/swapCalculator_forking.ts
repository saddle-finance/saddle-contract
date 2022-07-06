import chai from "chai"
import { solidity } from "ethereum-waffle"
import { ContractFactory, Signer } from "ethers"
import { deployments, network } from "hardhat"
import { GenericERC20, Swap, SwapCalculator } from "../build/typechain"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../utils/network"
import { BIG_NUMBER_1E18 } from "./testUtils"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

describe("SwapCalculator (D4 pool on forked mainnet) [ @skip-on-coverage ]", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let swapCalculator: SwapCalculator
  let tokens: GenericERC20[]
  let factory: ContractFactory
  let usdv2: Swap
  let d4: Swap

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl:
              ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] + process.env.ALCHEMY_API_KEY,
            blockNumber: 14391465,
          },
        },
      ],
    })

    // await setTimestamp(16473514010)
  })

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture([], { keepExistingDeployments: true }) // start from empty state

      signers = await ethers.getSigners()
      owner = signers[0]
      factory = await ethers.getContractFactory("SwapCalculator")

      swapCalculator = (await factory.deploy()) as SwapCalculator

      usdv2 = await ethers.getContractAt(
        "Swap",
        "0xaCb83E0633d6605c5001e2Ab59EF3C745547C8C7",
      )
      d4 = await ethers.getContractAt(
        "Swap",
        "0xC69DDcd4DFeF25D8a793241834d4cc4b3668EAD6",
      )

      const batchCall = [
        await swapCalculator.populateTransaction.addPool(usdv2.address),
        await swapCalculator.populateTransaction.addPool(d4.address),
      ]

      const batchCallData = batchCall
        .map((x) => x.data)
        .filter((x): x is string => !!x)

      await swapCalculator.batch(batchCallData, false)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("calculateSwapOutput", () => {
    it("Successfully calculates exact outputs using existing pool address", async () => {
      const expectedOutput = await swapCalculator.calculateSwapOutput(
        d4.address,
        0,
        1,
        BIG_NUMBER_1E18.mul(10000),
      )
      expect(expectedOutput).to.eq("9984926531656679265213")
      expect(await d4.calculateSwap(0, 1, BIG_NUMBER_1E18.mul(10000))).to.eq(
        "9984926531656679265213",
      )
    })
  })

  describe("calculateSwapInput", () => {
    it("Successfully calculates exact inputs using existing pool address", async () => {
      const expectedInput = await swapCalculator.calculateSwapInput(
        d4.address,
        0,
        1,
        "9984926531656679265213",
      )
      const estimatedGas = await swapCalculator.estimateGas.calculateSwapInput(
        d4.address,
        0,
        1,
        "9984926531656679265213",
      )
      console.log(`Estimated gas: ${estimatedGas}`)
      expect(expectedInput).to.eq(BIG_NUMBER_1E18.mul(10000).toString())
    })
  })

  describe("relativePrice", () => {
    it("Successfully calculates FEI/alUSD", async () => {
      const expected = await swapCalculator.callStatic.relativePrice(
        d4.address,
        0,
        1,
      )
      expect(expected).to.eq("998894036118118852")
    })

    it("Successfully calculates alUSD/FEI", async () => {
      const expected = await swapCalculator.callStatic.relativePrice(
        d4.address,
        1,
        0,
      )
      expect(expected).to.eq("1001107188026069812")
    })

    it("Successfully calculates FRAX/alUSD", async () => {
      const expected = await swapCalculator.callStatic.relativePrice(
        d4.address,
        0,
        2,
      )
      expect(expected).to.eq("998670093221278377")
    })

    it("Successfully calculates LUSD/alUSD", async () => {
      const expected = await swapCalculator.callStatic.relativePrice(
        d4.address,
        0,
        3,
      )
      expect(expected).to.eq("995566550113770902")
    })

    it("Successfully calculates FRAX/LUSD", async () => {
      const expected = await swapCalculator.callStatic.relativePrice(
        d4.address,
        3,
        2,
      )
      expect(expected).to.eq("1003117362988855823")
    })
  })
})
