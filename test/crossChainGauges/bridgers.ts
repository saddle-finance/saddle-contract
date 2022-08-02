import chai from "chai"
import { solidity } from "ethereum-waffle"
import { Signer } from "ethers"
import { deployments, network } from "hardhat"
import {
  AnyCallTranslator,
  RootGauge,
  RootGaugeFactory,
} from "../../build/typechain/"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"
import { setTimestamp } from "../testUtils"

chai.use(solidity)
const { expect } = chai

describe("Bridgers", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGauge
  let anycallTranslator: AnyCallTranslator

  // Fork specific block on mainnet
  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl:
              ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] + process.env.ALCHEMY_API_KEY,
            blockNumber: 11598050,
          },
        },
      ],
    })

    await setTimestamp(1609896169)
  })

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  //   describe("Arbitrum bridger", () => {
  //     it(`Bridge call goes through on root side`, async () => {
  //         await token.approve(arb bridger)
  //         await arbitrumBridger.bridge()
  //         // test balance changed
  //         expect()
  //     })
  //   })

  //   describe("Optimism bridger", () => {
  //     it(`Bridge call goes through on root side`, async () => {
  //         await arbitrumBridger.bridge()
  //         // test balance changed
  //         expect()
  //     })
  //   })

  //   describe("[] bridger", () => {
  //     it(`Bridge call goes through on root side`, async () => {
  //         await arbitrumBridger.bridge()
  //         // test balance changed
  //         expect()
  //     })
  //   })
})
