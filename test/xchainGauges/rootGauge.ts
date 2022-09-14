import chai from "chai"
import { ContractFactory, Signer } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  MockAnyCall,
  MockBridger,
  RootGauge,
  RootGaugeFactory,
} from "../../build/typechain"

const { expect } = chai

describe("Root_Gauge", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGauge
  let anycallTranslator: AnyCallTranslator
  let mockBridger: MockBridger
  let mockAnyCall: MockAnyCall
  let lpTokenFactory: ContractFactory
  let sampleLPToken: string

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
  const NON_ZERO_ADDRESS = "0x0C8BAe14c9f9BF2c953997C881BEfaC7729FD314"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

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

      // TODO: Root Gauge Initialize fails because "already initialized", however we did not initialize
      //   await rootGauge.initialize(NON_ZERO_ADDRESS, 11, "Test")
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Tests Checkpoint", () => {
    it(`deploys`, async () => true)
  })
})
