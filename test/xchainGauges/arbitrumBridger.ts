import chai from "chai"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import { ArbitrumBridger } from "../../build/typechain"

const { execute } = deployments

const { expect } = chai

describe("ArbitrumBridger", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let arbitrumBridger: ArbitrumBridger

  const gasLimit = 1000000
  const gasPrice = 990000000
  const maxSubmissionCost = 10000000000000

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      const bridgerFactory = await ethers.getContractFactory("ArbitrumBridger")
      arbitrumBridger = (await bridgerFactory.deploy(
        gasLimit,
        gasPrice,
        maxSubmissionCost,
        (
          await ethers.getContract("SDL")
        ).address,
      )) as ArbitrumBridger
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Arbitrum Bridger", () => {
    it(`Successfully initializes with cost`, async () => {
      expect(await arbitrumBridger.cost()).to.eq(
        gasLimit * gasPrice + maxSubmissionCost,
      )
    })
  })
})
