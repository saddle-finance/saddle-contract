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

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Deploy child gauge
      const bridgerFactory = await ethers.getContractFactory("ArbitrumBridger")
      //   uint256 _gasLimit,
      //     uint256 _gasPrice,
      //     uint256 _maxSubmissionCost

      arbitrumBridger = (await bridgerFactory.deploy(
        1_000_000,
        2 * 10 ** 9,
        10 ** 13,
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

  describe("Initialize RewardForwarder", () => {
    it(`Successfully initializes with cost`, async () => {
      expect(await arbitrumBridger.cost()).to.eq(
        1_000_000 * (2 * 10 ** 9) + 10 ** 13,
      )
    })
  })
})
