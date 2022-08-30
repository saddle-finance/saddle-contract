import chai from "chai"
import { solidity } from "ethereum-waffle"
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
} from "../../build/typechain"

const { execute } = deployments

chai.use(solidity)
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
  let anycallTranslator: AnyCallTranslator
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

      // Deploy AnycallTranslator with mock anycall
      const anycallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anycallTranslatorFactory.deploy(
        users[0],
        mockAnycall.address,
      )) as AnyCallTranslator

      await mockAnycall.setanyCallTranslator(anycallTranslator.address)

      // **** Setup rootGauge Factory ****

      const rootGaugeFactoryFactory = await ethers.getContractFactory(
        "RootGaugeFactory",
      )
      rootGaugeFactory = (await rootGaugeFactoryFactory.deploy(
        anycallTranslator.address,
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
      await anycallTranslator.setGaugeFactory(rootGaugeFactory.address)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize AnycallTranslator", () => {
    it(`Successfully calls anycall execute`, async () => {
      // ensure Root Factory is setup
      console.log("bridger", rootGaugeFactory.get_bridger(1))
      console.log("implementation", rootGaugeFactory.get_implementation())

      const ABI = ["function deploy_gauge(uint256 _chain_id, bytes32 _salt)"]
      const iface = new ethers.utils.Interface(ABI)
      const data = iface.encodeFunctionData("deploy_gauge", [
        1,
        "0x6162636400000000000000000000000000000000000000000000000000000000",
      ])

      const gaugeDeployTx = await mockAnycall.callAnyExecute(
        anycallTranslator.address,
        data,
      )
      const contractReceipt = await gaugeDeployTx.wait()
      // console.log("receipt: ", contractReceipt)
      console.log("result: ", await anycallTranslator.dataResult())
      const event = contractReceipt.events?.find(
        (event) => event.event === "successMsg",
      )
      console.log("successMsg: ", event)
      const event2 = contractReceipt.events?.find(
        (event) => event.event === "resultMsg",
      )
      console.log("resultMsg: ", event2)
      console.log("gauge count: ", await rootGaugeFactory.get_gauge_count(1))
    })
  })
})
