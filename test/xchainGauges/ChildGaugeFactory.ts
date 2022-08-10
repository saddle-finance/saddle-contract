import chai, { assert } from "chai"
import { solidity } from "ethereum-waffle"
import { Bytes, Signer, utils } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  ChildGauge,
  ChildGaugeFactory,
} from "../../build/typechain"
import { MockAnyCall } from "../../build/typechain/contracts/xchainGauges/mock/MockAnycall.sol/MockAnyCall"

import { isTestNetwork, ZERO_ADDRESS } from "../testUtils"

chai.use(solidity)
const { expect } = chai
const saltBytes = utils.formatBytes32String("0")

describe("ChildGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let childGaugeFactory: ChildGaugeFactory
  let childGauge: ChildGauge
  let anycallTranslator: AnyCallTranslator
  let mockAnyCall: MockAnyCall

  const MOCK_ADDRESS = "0x0000000000000000000000000000000000000001"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Replace with mock contract unless being tested on forked mainnet
      const mockAnyCallFactory = await ethers.getContractFactory("MockAnyCall")
      mockAnyCall = (await mockAnyCallFactory.deploy()) as MockAnyCall

      // Deploy anycallTranslator
      const anyCallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anyCallTranslatorFactory.deploy(
        users[0],
        mockAnyCall.address,
      )) as AnyCallTranslator

      // Child Gauge factory
      const childGaugeFactoryFactory = await ethers.getContractFactory(
        "ChildGaugeFactory",
      )
      childGaugeFactory = (await childGaugeFactoryFactory.deploy(
        anycallTranslator.address,
        (
          await ethers.getContract("SDL")
        ).address,
        users[0],
      )) as ChildGaugeFactory

      // Root Gauge Implementation
      const gaugeImplementationFactory = await ethers.getContractFactory(
        "ChildGauge",
      )
      childGauge = (await gaugeImplementationFactory.deploy(
        (
          await ethers.getContract("SDL")
        ).address,
        childGaugeFactory.address,
      )) as ChildGauge

      await childGaugeFactory.set_implementation(childGauge.address)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize ChildGaugeFactory", () => {
    it(`Successfully sets child gauge implementation`, async () => {
      const contractTx = await childGaugeFactory.set_implementation(
        childGauge.address,
      )
      const contractReceipt = await contractTx.wait()
      const event = contractReceipt.events?.find(
        (event) => event.event === "UpdateImplementation",
      )
      const implementationAddr = event?.args!["_new_implementation"]
      expect(implementationAddr).to.eq(childGauge.address)
      expect(await childGaugeFactory.get_implementation()).to.eq(
        childGauge.address,
      )
    })
    it(`Successfully access checks when setting root gauge implementation`, async () => {
      await expect(
        childGaugeFactory.connect(user1).set_implementation(childGauge.address),
      ).to.be.reverted
    })
    it(`Successfully sets voting escrow implementation`, async () => {
      const contractTx = await childGaugeFactory.set_voting_escrow(MOCK_ADDRESS)
      const contractReceipt = await contractTx.wait()
      const event = contractReceipt.events?.find(
        (event) => event.event === "UpdateVotingEscrow",
      )
      const votingescrowAddr = event?.args!["_new_voting_escrow"]
      expect(votingescrowAddr).to.eq(MOCK_ADDRESS)
    })
    it("Successfully access checks sets voting escrow implementation", async () => {
      await expect(
        childGaugeFactory.connect(user1).set_voting_escrow(MOCK_ADDRESS),
      ).to.be.reverted
    })
  })
  describe("Successfully deploys a root gauge", () => {
    // TODO: when implementation has not been set yet thie deploy still happens,
    // in addition it happens with LP Token = Zero Address which is explicitly not allowed in the contract
    it(`Successfully deploys a child gauge when call comes from the anycall translator`, async () => {
      // ** below needs to be called from the anycallExecuter
      // const tx = await childGaugeFactory
      //   .connect(anycallTranslator.address)
      //   ["deploy_gauge(address,bytes32)"](ZERO_ADDRESS, saltBytes)
      // const txReceipt = await tx.wait()
      // const deployEvent = txReceipt.events?.find(
      //   (event) => event.event === "DeployedGauge",
      // )
      // console.log(deployEvent)
      // expect(deployEvent?.args!["_implementation"]).to.eq(childGauge.address)
      // expect()
      // expect("AnyCall").to.be.include(tx.data)
    })
  })
})
