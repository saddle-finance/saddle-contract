import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import chai from "chai"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import { AnyCallTranslator, RootGaugeFactory } from "../../build/typechain"
import { convertGaugeNameToSalt, ZERO_ADDRESS } from "../testUtils"
import {
  TEST_SIDE_CHAIN_ID,
  setupAnyCallTranslator,
  setupRootGaugeFactory,
} from "./utils"

const { expect } = chai

describe("RootGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let rootGaugeFactory: RootGaugeFactory
  let anyCallTranslator: AnyCallTranslator

  const TEST_GAUGE_NAME = "USD pool"
  const TEST_ADDRESS = "0x00000000000000000000000000000000DeaDBeef"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      const contracts = await setupAnyCallTranslator(users[0])
      anyCallTranslator = contracts.anyCallTranslator

      // **** Setup rootGauge Factory ****

      rootGaugeFactory = await setupRootGaugeFactory(
        anyCallTranslator.address,
        users[0],
      )
      await anyCallTranslator.addKnownCallers([rootGaugeFactory.address])
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize RootGaugeFactory", () => {
    it(`Successfully sets root gauge implementation`, async () => {
      await expect(rootGaugeFactory.set_implementation(TEST_ADDRESS))
        .to.emit(rootGaugeFactory, "UpdateImplementation")
        .withArgs(anyValue, TEST_ADDRESS)
      expect(await rootGaugeFactory.get_implementation()).to.eq(TEST_ADDRESS)
    })
    it(`Successfully access checks when setting root gauge implementation`, async () => {
      await expect(
        rootGaugeFactory.connect(user1).set_implementation(TEST_ADDRESS),
      ).to.be.reverted
    })
    it(`Successfully sets bridger`, async () => {
      await expect(
        rootGaugeFactory.set_bridger(TEST_SIDE_CHAIN_ID, ZERO_ADDRESS),
      )
        .to.emit(rootGaugeFactory, "BridgerUpdated")
        .withArgs(TEST_SIDE_CHAIN_ID, anyValue, ZERO_ADDRESS)
      expect(await rootGaugeFactory.get_bridger(TEST_SIDE_CHAIN_ID)).to.eq(
        ZERO_ADDRESS,
      )
    })
    it(`Successfully access checks when setting bridger`, async () => {
      await expect(
        rootGaugeFactory
          .connect(user1)
          .set_bridger(TEST_SIDE_CHAIN_ID, ZERO_ADDRESS),
      ).to.be.reverted
    })
  })
  describe("deploy_gauge", () => {
    it(`Successfully deploys a root gauge`, async () => {
      await rootGaugeFactory.deploy_gauge(
        TEST_SIDE_CHAIN_ID,
        convertGaugeNameToSalt(TEST_GAUGE_NAME),
        TEST_GAUGE_NAME,
      )
      expect(await rootGaugeFactory.get_gauge_count(TEST_SIDE_CHAIN_ID)).to.eq(
        1,
      )
      expect(await rootGaugeFactory.get_gauge(TEST_SIDE_CHAIN_ID, 0)).to.not.eq(
        ZERO_ADDRESS,
      )
    })
  })
})
