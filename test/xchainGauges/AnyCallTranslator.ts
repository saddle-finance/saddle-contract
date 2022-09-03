import chai from "chai"
import { ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
  GenericERC20,
  LPToken,
  MockAnyCall,
  MockBridger,
  RewardForwarder,
  RootGauge,
  RootGaugeFactory,
  TransparentUpgradeableProxy__factory,
} from "../../build/typechain"
import { convertGaugeNameToSalt } from "../testUtils"

const { execute } = deployments

const { expect } = chai

describe("AnycallTranslator", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let mockAnycall: MockAnyCall
  let rewardForwarder: RewardForwarder
  let testToken: LPToken
  let firstGaugeToken: GenericERC20
  let lpTokenFactory: ContractFactory
  let rootGaugeFactory: RootGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let mockBridger: MockBridger
  let rootGauge: RootGauge

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Deploy mock anycall
      const mockAnycallFactory = await ethers.getContractFactory("MockAnyCall")
      mockAnycall = (await mockAnycallFactory.deploy()) as MockAnyCall

      // Deploy ProxyAdmin
      const proxyAdminFactory = await ethers.getContractFactory("ProxyAdmin")
      const proxyAdmin = await proxyAdminFactory.deploy()

      // Deploy AnycallTranslator with mock anycall
      const anycallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      const anycallTranslatorLogic =
        (await anycallTranslatorFactory.deploy()) as AnyCallTranslator

      // Deploy the proxy that will be used as AnycallTranslator
      // We want to set the owner of the logic level to be deployer
      const initializeCallData = (
        await anycallTranslatorLogic.populateTransaction.initialize(
          users[0],
          mockAnycall.address,
        )
      ).data as string

      // Deploy the proxy with anycall translator logic and initialize it
      const proxyFactory: TransparentUpgradeableProxy__factory =
        await ethers.getContractFactory("TransparentUpgradeableProxy")
      const proxy = await proxyFactory.deploy(
        anycallTranslatorLogic.address,
        proxyAdmin.address,
        initializeCallData,
      )
      anyCallTranslator = await ethers.getContractAt(
        "AnyCallTranslator",
        proxy.address,
      )

      await mockAnycall.setanyCallTranslator(anyCallTranslator.address)

      // **** Setup rootGauge Factory ****

      const rootGaugeFactoryFactory = await ethers.getContractFactory(
        "RootGaugeFactory",
      )
      rootGaugeFactory = (await rootGaugeFactoryFactory.deploy(
        anyCallTranslator.address,
        users[0],
      )) as RootGaugeFactory

      const mockBridgerFactory = await ethers.getContractFactory("MockBridger")
      mockBridger = (await mockBridgerFactory.deploy()) as MockBridger
      // Set Bridger to mock bridger
      await rootGaugeFactory.set_bridger(1, mockBridger.address)

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
      await rootGaugeFactory.set_implementation(rootGauge.address)

      // Set Gauge Facotory in AnycallTranslator
      await anyCallTranslator.setGaugeFactory(rootGaugeFactory.address)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("callAnyExecute()", () => {
    it(`Successfully deploys a new gauge`, async () => {
      // ensure Root Factory is setup
      console.log("bridger", await rootGaugeFactory.get_bridger(1))
      console.log("implementation", await rootGaugeFactory.get_implementation())

      const iface = (await ethers.getContractFactory("RootGaugeFactory"))
        .interface

      // Format deploy_gauge(uint256,bytes32,string) calldata
      const data = iface.encodeFunctionData("deploy_gauge", [
        1,
        convertGaugeNameToSalt("Sample Root Gauge"),
        "Sample Root Gauge",
      ])
      console.log(data)

      await expect(mockAnycall.callAnyExecute(anyCallTranslator.address, data))
        .to.emit(mockAnycall, "successMsg")
        .and.emit(mockAnycall, "resultMsg")

      expect(await rootGaugeFactory.get_gauge_count(1), "Gauge count").to.eq(1)
    })
  })
})
