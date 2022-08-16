import chai, { assert } from "chai"
import { solidity } from "ethereum-waffle"
import { ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  ChildGaugeFactory,
  LPToken,
  RewardForwarder,
  AnyCallTranslator,
  ChildGauge,
  GenericERC20,
  MockAnyCall,
} from "../../build/typechain"

import { BIG_NUMBER_1E18, ZERO_ADDRESS } from "../testUtils"
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
  let childGaugeFactory: ChildGaugeFactory
  let anycallTranslator: AnyCallTranslator
  let childGauge: ChildGauge

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
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize AnycallTranslator", () => {
    it(`Successfully calls anycall execute`, async () => {
      let ABI = ["function deploy_gauge(uint256 _chain_id, bytes32 _salt)"]
      let iface = new ethers.utils.Interface(ABI)
      const data = iface.encodeFunctionData("deploy_gauge", [
        1,
        "0x6162636400000000000000000000000000000000000000000000000000000000",
      ])

      //   const data = ethers.utils.defaultAbiCoder.encode(
      //     ["bytes", "uint256", "bytes"],
      //     ["deploy_gauge(uint256,bytes32)", 11, "0x0"],
      //   )
      //   ethers.utils.encodeInterface(ABC).encodeFunctionData("deploy_gauge", [
      const gaugeDeployTx = await mockAnycall.callAnyExecute(
        anycallTranslator.address,
        data,
      )
      const contractReceipt = await gaugeDeployTx.wait()
      console.log("receipt: ", contractReceipt.events)
      const event = contractReceipt.events?.find(
        (event) => event.event === "NewMsg",
      )
      console.log("event: ", event)
    })
  })
})
