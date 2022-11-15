import chai from "chai"
import dotenv from "dotenv"
import { deployments, ethers, network, tracer } from "hardhat"
import { RootGaugeFactory } from "../build/typechain"
import { PROD_DEPLOYER_ADDRESS } from "../utils/accounts"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../utils/network"
import { convertGaugeNameToSalt, impersonateAccount } from "./testUtils"

dotenv.config()
const { expect } = chai

describe("Forked test template", () => {
  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      tracer.enabled = true
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl:
                ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] +
                process.env.ALCHEMY_API_KEY,
              blockNumber: 15924316,
            },
          },
        ],
      })
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  after(async () =>
    network.provider.request({
      method: "hardhat_reset",
      params: [],
    }),
  )

  describe("test", () => {
    it("test", async () => {
      const rgf: RootGaugeFactory = await ethers.getContractAt(
        "RootGaugeFactory",
        "0x19a5Ec09eE74f64573ac53f48A48616CE943C047",
      )
      const deployer = await impersonateAccount(PROD_DEPLOYER_ADDRESS)
      await rgf.deploy_gauge(
        CHAIN_ID.ARBITRUM_MAINNET,
        convertGaugeNameToSalt("ArbUSD2"),
        "ArbUSD2",
      )
    })
  })
})
