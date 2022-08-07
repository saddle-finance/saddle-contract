import chai from "chai"
import { solidity } from "ethereum-waffle"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import { AnyCallTranslator } from "../../build/typechain/contracts/crossChainGauges/AnycallTranslator.sol"
import { ChildGauge } from "../../build/typechain/contracts/crossChainGauges/implementations/ChildGauge.vy"
import { ChildGaugeFactory } from "../../build/typechain/contracts/crossChainGauges/ChildGaugeFactory.vy"

chai.use(solidity)
const { expect } = chai

describe("ChildGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let childGaugeFactory: ChildGaugeFactory
  let childGauge: ChildGauge
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
      childGaugeFactory = (await rootGaugeFactoryFactory.deploy(
        anycallTranslator,
      )) as ChildGaugeFactory

      // Root Gauge Implementation
      const gaugeImplementationFactory = await ethers.getContractFactory(
        "ChildGauge",
      )
      childGauge = (await gaugeImplementationFactory.deploy(
        (
          await ethers.getContract("SDL")
        ).address,
        (
          await ethers.getContract("GaugeController")
        ).address,
        (
          await ethers.getContract("Minter")
        ).address,
      )) as ChildGauge
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("ChildGaugeFactory", () => {
    it(`Successfully sets child gauge implementation`, async () => {
      // Write test here
      return
    })
  })
})
