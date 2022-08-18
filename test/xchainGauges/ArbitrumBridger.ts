import chai, { assert } from "chai"
import { solidity } from "ethereum-waffle"
import { ContractFactory, Signer } from "ethers"
import { deployments, network } from "hardhat"
import {
  ChildGaugeFactory,
  LPToken,
  RewardForwarder,
  AnyCallTranslator,
  ChildGauge,
  GenericERC20,
  ArbitrumBridger,
} from "../../build/typechain"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"

import { BIG_NUMBER_1E18, setTimestamp, ZERO_ADDRESS } from "../testUtils"
const { execute } = deployments

chai.use(solidity)
const { expect } = chai

describe("ArbitrumBridger", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let rewardForwarder: RewardForwarder
  let testToken: LPToken
  let firstGaugeToken: GenericERC20
  let lpTokenFactory: ContractFactory
  let childGaugeFactory: ChildGaugeFactory
  let arbitrumBridger: ArbitrumBridger
  let anycallTranslator: AnyCallTranslator
  let childGauge: ChildGauge
  let SDLAddr: string

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
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
      const SDLAddr = (await ethers.getContract("SDL")).address
      console.log("SDLAddr: ", SDLAddr)
      // 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

      // Deploy child gauge

      const bridgerFactory = await ethers.getContractFactory("ArbitrumBridger")

      // TODO: below fails
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
    // fork mainnet
    before(async () => {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl:
                ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] +
                process.env.ALCHEMY_API_KEY,
              blockNumber: 11598050,
            },
          },
        ],
      })

      await setTimestamp(1609896169)
    })
  })

  describe("Arbitrum Bridger", () => {
    it(`Successfully initializes with cost`, async () => {
      console.log(SDLAddr)
      expect(await arbitrumBridger.cost()).to.eq(
        gasLimit * gasPrice + maxSubmissionCost,
      )
    })
  })
})
