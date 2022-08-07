import chai, { assert } from "chai"
import { solidity } from "ethereum-waffle"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  RootGauge,
  RootGaugeFactory,
} from "../../build/typechain"

import { ZERO_ADDRESS } from "../testUtils"

chai.use(solidity)
const { expect } = chai

describe("RootGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGauge
  let anycallTranslator: AnyCallTranslator

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Replace with mock address unless being tested on forked mainnet
      const anyCallAddress = ZERO_ADDRESS

      // Replace with mock address unless being tested on forked mainnet
      const bridgerAddress = ZERO_ADDRESS

      // Deploy anycallTranslator
      const anyCallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anyCallTranslatorFactory.deploy(
        anyCallAddress,
      )) as AnyCallTranslator

      // Root Gauge factory
      const rootGaugeFactoryFactory = await ethers.getContractFactory(
        "RootGaugeFactory",
      )
      rootGaugeFactory = (await rootGaugeFactoryFactory.deploy(
        anycallTranslator.address,
        users[0],
      )) as RootGaugeFactory

      // Root Gauge Implementation
      const gaugeImplementationFactory = await ethers.getContractFactory(
        "RootGauge",
      )
      rootGauge = (await gaugeImplementationFactory.deploy(
        (
          await ethers.getContract("SDL")
        ).address,
        (
          await ethers.getContract("GaugeController")
        ).address,
        (
          await ethers.getContract("Minter")
        ).address,
      )) as RootGauge
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize RootGaugeFactory", () => {
    it(`Successfully sets root gauge implementation`, async () => {
      const contractTx = await rootGaugeFactory.set_implementation(
        rootGauge.address,
      )
      const contractReceipt = await contractTx.wait()
      const event = contractReceipt.events?.find(
        (event) => event.event === "UpdateImplementation",
      )
      const implementationAddr = event?.args!["_new_implementation"]
      expect(implementationAddr).to.eq(rootGauge.address)
      expect(await rootGaugeFactory.get_implementation()).to.eq(
        rootGauge.address,
      )
    })
    it(`Successfully access checks when setting root gauge implementation`, async () => {
      await expect(
        rootGaugeFactory.connect(user1).set_implementation(rootGauge.address),
      ).to.be.reverted
    })
    it(`Successfully sets bridger`, async () => {
      const contractTx = await rootGaugeFactory.set_bridger(2222, ZERO_ADDRESS)
      const contractReceipt = await contractTx.wait()
      const event = contractReceipt.events?.find(
        (event) => event.event === "BridgerUpdated",
      )
      const implementationAddr = event?.args!["_new_bridger"]
      expect(implementationAddr).to.eq(ZERO_ADDRESS)
      expect(await rootGaugeFactory.get_bridger(2222)).to.eq(ZERO_ADDRESS)
    })
    it(`Successfully access checks when setting bridger`, async () => {
      await expect(
        rootGaugeFactory.connect(user1).set_bridger(2222, ZERO_ADDRESS),
      ).to.be.reverted
    })
  })
})
