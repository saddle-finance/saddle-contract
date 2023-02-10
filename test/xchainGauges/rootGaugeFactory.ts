import chai from "chai"
import { Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
  ChildGaugeFactory__factory,
  MockAnyCall,
  RootGaugeFactory,
} from "../../build/typechain"
import { convertGaugeNameToSalt, ZERO_ADDRESS } from "../testUtils"
import {
  setupAnyCallTranslator,
  setupRootGaugeFactory,
  TEST_SIDE_CHAIN_ID,
} from "./utils"

const { expect } = chai

describe("RootGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let rootGaugeFactory: RootGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let mockAnyCall: MockAnyCall

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
      mockAnyCall = contracts.mockAnyCall

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
    it(`Reverts when there is no bridger for the given chain id`, async () => {
      await expect(
        rootGaugeFactory.deploy_gauge(
          TEST_SIDE_CHAIN_ID + 1,
          convertGaugeNameToSalt(TEST_GAUGE_NAME),
          TEST_GAUGE_NAME,
        ),
      ).to.be.reverted
    })
  })

  describe("deploy_child_gauge", () => {
    it(`Successfully sends a call to AnyCall contract`, async () => {
      const cgfFactory: ChildGaugeFactory__factory =
        await ethers.getContractFactory("ChildGaugeFactory")
      const anyCallTranslatorCallData = cgfFactory.interface.encodeFunctionData(
        "deploy_gauge(address,bytes32,string,address)",
        [
          // LP token address
          TEST_ADDRESS,
          // Salt
          convertGaugeNameToSalt(TEST_GAUGE_NAME),
          // name to be used for part of gauge name
          TEST_GAUGE_NAME,
          // address of the manager/owner
          users[0],
        ],
      )
      // Format additional calldata for calling AnyCallTranslatorProxy.anyExecute()
      const anyCallCallData = ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [rootGaugeFactory.address, anyCallTranslatorCallData],
      )

      await expect(
        rootGaugeFactory[
          "deploy_child_gauge(uint256,address,bytes32,string,address)"
        ](
          TEST_SIDE_CHAIN_ID,
          TEST_ADDRESS,
          convertGaugeNameToSalt(TEST_GAUGE_NAME),
          TEST_GAUGE_NAME,
          users[0],
        ),
      )
        .to.emit(mockAnyCall, "AnyCallMessage")
        .withArgs(
          anyCallTranslator.address,
          anyCallCallData,
          ZERO_ADDRESS,
          TEST_SIDE_CHAIN_ID,
          0,
        )
    })
    it(`Reverts when there is no bridger for the given chain id`, async () => {
      await expect(
        rootGaugeFactory["deploy_child_gauge(uint256,address,bytes32,string)"](
          TEST_SIDE_CHAIN_ID + 1,
          TEST_ADDRESS,
          convertGaugeNameToSalt(TEST_GAUGE_NAME),
          TEST_GAUGE_NAME,
        ),
      ).to.be.reverted
    })
  })

  describe("set_implementation", () => {
    it(`Successfully sets root gauge implementation`, async () => {
      const currentImplementation = await rootGaugeFactory.get_implementation()
      await expect(rootGaugeFactory.set_implementation(TEST_ADDRESS))
        .to.emit(rootGaugeFactory, "UpdateImplementation")
        .withArgs(currentImplementation, TEST_ADDRESS)
      expect(await rootGaugeFactory.get_implementation()).to.eq(TEST_ADDRESS)
    })
    it(`Reverts when called by non-owner`, async () => {
      await expect(
        rootGaugeFactory.connect(user1).set_implementation(TEST_ADDRESS),
      ).to.be.reverted
    })
  })

  describe("set_bridger", () => {
    it(`Successfully sets bridger`, async () => {
      const currentBridger = await rootGaugeFactory.get_bridger(
        TEST_SIDE_CHAIN_ID,
      )
      await expect(
        rootGaugeFactory.set_bridger(TEST_SIDE_CHAIN_ID, TEST_ADDRESS),
      )
        .to.emit(rootGaugeFactory, "BridgerUpdated")
        .withArgs(TEST_SIDE_CHAIN_ID, currentBridger, TEST_ADDRESS)
      expect(await rootGaugeFactory.get_bridger(TEST_SIDE_CHAIN_ID)).to.eq(
        TEST_ADDRESS,
      )
    })
    it(`Reverts when called by non-owner`, async () => {
      await expect(
        rootGaugeFactory
          .connect(user1)
          .set_bridger(TEST_SIDE_CHAIN_ID, ZERO_ADDRESS),
      ).to.be.reverted
    })
  })

  describe("set_call_proxy", () => {
    it(`Successfully sets call proxy`, async () => {
      const currentCallProxyAddress = await rootGaugeFactory.call_proxy()
      await expect(rootGaugeFactory.set_call_proxy(TEST_ADDRESS))
        .to.emit(rootGaugeFactory, "UpdateCallProxy")
        .withArgs(currentCallProxyAddress, TEST_ADDRESS)
      expect(await rootGaugeFactory.call_proxy()).to.eq(TEST_ADDRESS)
    })
    it(`Reverts when called by non-owner`, async () => {
      await expect(rootGaugeFactory.connect(user1).set_call_proxy(TEST_ADDRESS))
        .to.be.reverted
    })
  })

  describe("commit_transfer_ownership", () => {
    it(`Reverts when not called by the owner`, async () => {
      await expect(
        rootGaugeFactory
          .connect(signers[1])
          .commit_transfer_ownership(TEST_ADDRESS),
      ).to.be.reverted
    })

    it(`Successfully sets futureOwner`, async () => {
      await rootGaugeFactory.commit_transfer_ownership(TEST_ADDRESS)
      expect(await rootGaugeFactory.future_owner()).to.eq(TEST_ADDRESS)
    })
  })

  describe("accept_transfer_ownership", () => {
    it(`Reverts when not called by the futureOwner`, async () => {
      await expect(
        rootGaugeFactory.connect(signers[1]).accept_transfer_ownership(),
      ).to.be.reverted
    })

    it(`Successfully transfers ownership to futureOwner`, async () => {
      await rootGaugeFactory.commit_transfer_ownership(users[10])
      await expect(
        rootGaugeFactory.connect(signers[10]).accept_transfer_ownership(),
      )
        .to.emit(rootGaugeFactory, "TransferOwnership")
        .withArgs(users[0], users[10])
      expect(await rootGaugeFactory.owner()).to.eq(users[10])
    })
  })
})
