import chai from "chai"
import { solidity } from "ethereum-waffle"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  RootGauge,
  RootGaugeFactory,
} from "../../build/typechain/"

chai.use(solidity)
const { expect } = chai

describe("ChildGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGauge
  let anycallTranslator: AnyCallTranslator

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Deploy anycallTranslator
      const anyCallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anyCallTranslatorFactory.deploy(
        anycallTranslator,
      )) as AnyCallTranslator

      // Root Gauge factory
      const rootGaugeFactoryFactory = await ethers.getContractFactory(
        "RootGaugeFactory",
      )
      rootGaugeFactory = (await rootGaugeFactoryFactory.deploy(
        anycallTranslator,
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

  describe("ChildGaugeFactory", () => {
    it(`Successfully sets child gauge implementation`, async () => {
      // Write test here
    })
  })
})
