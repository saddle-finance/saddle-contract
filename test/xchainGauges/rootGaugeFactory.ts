import chai from "chai"
import { ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
  MockAnyCall,
  MockBridger,
  RootGauge,
  RootGaugeFactory,
} from "../../build/typechain"

const { expect } = chai

describe("RootGaugeFactory", () => {
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

      // Deploy mock bridger
      const mockBridgerFactory = await ethers.getContractFactory("MockBridger")
      mockBridger = (await mockBridgerFactory.deploy()) as MockBridger

      // Deploy mock anycall
      const mockAnyCallFactory = await ethers.getContractFactory("MockAnyCall")
      mockAnyCall = (await mockAnyCallFactory.deploy()) as MockAnyCall
      // mock LP token factory
      // const sampleLPToken = (await ethers.getContract("Saddle4Pool")).address
      // lpTokenFactory = await ethers.getContractFactory("LPToken")

      // Deploy anycallTranslator
      const anyCallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anyCallTranslatorFactory.deploy(
        users[0],
        mockAnyCall.address,
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

  const deployRootGauge = async function () {
    // set bridger to mock birdger
    await rootGaugeFactory.set_bridger(11, mockBridger.address)
    // set anycall to mock anycall
    await rootGaugeFactory.set_call_proxy(mockAnyCall.address)
    // set factory implementation
    await rootGaugeFactory.set_implementation(rootGauge.address)
    // deploy root gauge (no mirrored gauge, just on mainnet)
    // TODO: below fails for unknown reason
    const gaugeDeployTx = await rootGaugeFactory.deploy_gauge(
      // mock chain ID
      11,
      // keccack256(bytes32("Sample_Name"))
      ethers.utils.keccak256(ethers.utils.formatBytes32String("Sample_Name")),
      "Sample_Name",
    )

    const contractReceipt = await gaugeDeployTx.wait()
    // console.log("receipt: ", contractReceipt.events)
    const event = contractReceipt.events?.find(
      (event) => event.event === "DeployedGauge",
    )
    // console.log("event: ", event)
    const implementationAddr = event?.args!["_implementation"]
    console.log(implementationAddr)
    expect(implementationAddr).to.be.eq(rootGauge.address)
    const gaugeAddr = event?.args!["_gauge"]
    expect((await rootGaugeFactory.get_gauge_count(11).toString()) == "1")
  }

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
  describe("Deploy Gauge from RootGaugeFactory", () => {
    it(`Successfully deploys a root gauge`, async () => {
      await deployRootGauge()
      expect((await rootGaugeFactory.get_gauge_count(11).toString()) == "1")
      expect((await rootGaugeFactory.get_gauge(11, 0)).toString()).to.not.eq(
        ZERO_ADDRESS,
      )
    })
  })
})
