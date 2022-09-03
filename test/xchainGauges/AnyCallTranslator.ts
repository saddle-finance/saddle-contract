import chai from "chai"
import { ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
  ChildGaugeFactory,
  ChildOracle,
  GenericERC20,
  LPToken,
  MockAnyCall,
  MockBridger,
  RewardForwarder,
  RootGauge,
  RootGaugeFactory,
  RootOracle,
  SDL,
  VotingEscrow,
} from "../../build/typechain"
import { MAX_LOCK_TIME, WEEK } from "../../utils/time"
import {
  BIG_NUMBER_1E18,
  convertGaugeNameToSalt,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"
import {
  MOCK_CHAIN_ID,
  setupAnyCallTranslator,
  setupChildGaugeFactory,
  setupChildOracle,
  setupRootGaugeFactory,
  setupRootOracle,
} from "./utils"

import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"

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
  let childGaugeFactory: ChildGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let mockBridger: MockBridger
  let rootGauge: RootGauge
  let veSDL: VotingEscrow
  let rootOracle: RootOracle
  let childOracle: ChildOracle
  let dummyToken: GenericERC20

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
  const GAUGE_NAME = "Dummy Token X-chain Gauge"
  const GAUGE_SALT = convertGaugeNameToSalt(GAUGE_NAME)

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
      mockAnycall = contracts.mockAnycall

      // **** Setup rootGauge Factory ****

      rootGaugeFactory = await setupRootGaugeFactory(
        anyCallTranslator.address,
        users[0],
      )

      // **** Setup RootOracle ****
      rootOracle = await setupRootOracle(
        anyCallTranslator.address,
        rootGaugeFactory.address,
      )

      // **** Setup ChildOracle ****
      childOracle = await setupChildOracle(anyCallTranslator.address)

      // **** Setup ChildGaugeFactory ****
      childGaugeFactory = await setupChildGaugeFactory(
        anyCallTranslator.address,
        users[0],
        childOracle.address,
      )

      // **** Add expected callers to known callers ****
      anyCallTranslator.addKnownCallers([
        rootGaugeFactory.address,
        rootOracle.address,
        childGaugeFactory.address,
      ])

      // Set timestamp to start of the week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )

      // Create max lock from deployer address
      veSDL = await ethers.getContract("VotingEscrow")
      await ethers
        .getContract("SDL")
        .then((sdl) => (sdl as SDL).approve(veSDL.address, MAX_UINT256))
      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        (await getCurrentBlockTimestamp()) + MAX_LOCK_TIME,
      )

      dummyToken = (await ethers
        .getContractFactory("GenericERC20")
        .then((f) => f.deploy("Dummy Token", "DUMMY", 18))) as GenericERC20
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Root chain", () => {
    describe("Is used as source chain, originates anycall()", () => {
      it("Should be able to send message to trigger ChildGaugeFactory.deploy_gauge()", async () => {
        const DUMMY_TOKEN_ADDRESS = dummyToken.address
        const GAUGE_OWNER = users[0]

        const callData = childGaugeFactory.interface.encodeFunctionData(
          "deploy_gauge(address,bytes32,string,address)",
          [dummyToken.address, GAUGE_SALT, GAUGE_NAME, GAUGE_OWNER],
        )

        await expect(
          rootGaugeFactory[
            "deploy_child_gauge(uint256,address,bytes32,string,address)"
          ](
            MOCK_CHAIN_ID,
            DUMMY_TOKEN_ADDRESS,
            GAUGE_SALT,
            GAUGE_NAME,
            GAUGE_OWNER,
          ),
        )
          .to.emit(mockAnycall, "AnyCallMessage")
          .withArgs(
            anyCallTranslator.address,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [rootGaugeFactory.address, callData],
            ),
            ZERO_ADDRESS,
            MOCK_CHAIN_ID,
            0,
          )
      })

      it("Should be able to send message to trigger ChildOracle.receive()", async () => {
        await veSDL.checkpoint()

        const returnData = await veSDL.callStatic.user_point_history(
          users[0],
          veSDL.callStatic.user_point_epoch(users[0]),
        )

        const userPoint = {
          bias: returnData.bias,
          slope: returnData.slope,
          ts: returnData.ts,
        }

        const returnDataGlobal = await veSDL.callStatic.point_history(
          veSDL.callStatic.epoch(),
        )

        const globalPoint = {
          bias: returnDataGlobal.bias,
          slope: returnDataGlobal.slope,
          ts: returnDataGlobal.ts,
        }

        // receive((int128,int128,uint256),(int128,int128,uint256),address)
        const callData = childOracle.interface.encodeFunctionData("recieve", [
          userPoint,
          globalPoint,
          users[0],
        ])

        await expect(rootOracle["push(uint256)"](MOCK_CHAIN_ID))
          .to.emit(mockAnycall, "AnyCallMessage")
          .withArgs(
            anyCallTranslator.address,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [rootOracle.address, callData],
            ),
            ZERO_ADDRESS,
            MOCK_CHAIN_ID,
            0,
          )
      })
    })
  })
  describe("Is used as destination chain, target.anyExecute() is executed", () => {
    it("Should be able to recieve the message to deploy a root gauge via RootGaugeFactory.deploy_gauge()", async () => {
      const callData = rootGaugeFactory.interface.encodeFunctionData(
        "deploy_gauge",
        [MOCK_CHAIN_ID, GAUGE_SALT, GAUGE_NAME],
      )
      const implementation = await rootGaugeFactory.get_implementation()

      // Expect RootGaugeFactory to emit DeployedGauge event
      await expect(
        mockAnycall.callAnyExecute(
          anyCallTranslator.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [rootGaugeFactory.address, callData],
          ),
        ),
      )
        .to.emit(rootGaugeFactory, "DeployedGauge")
        .withArgs(
          implementation,
          MOCK_CHAIN_ID,
          anyCallTranslator.address,
          GAUGE_SALT,
          anyValue,
        )

      // Expect there is a new gauge deployed
      expect(await rootGaugeFactory.get_gauge_count(MOCK_CHAIN_ID)).to.eq(1)
    })
  })
})
