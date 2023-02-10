import chai from "chai"
import { Bytes, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
  ChildGaugeFactory,
  ChildOracle,
  GenericERC20,
  MockAnyCall,
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
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
  setTimestamp,
  ZERO_ADDRESS,
} from "../testUtils"
import {
  setupAnyCallTranslator,
  setupChildGaugeFactory,
  setupChildOracle,
  setupRootGaugeFactory,
  setupRootOracle,
  TEST_SIDE_CHAIN_ID,
} from "./utils"

import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import * as helpers from "@nomicfoundation/hardhat-network-helpers"

const { expect } = chai

describe("AnyCallTranslator", () => {
  let signers: Array<Signer>
  let users: string[]
  let mockAnyCall: MockAnyCall
  let rootGaugeFactory: RootGaugeFactory
  let childGaugeFactory: ChildGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let veSDL: VotingEscrow
  let rootOracle: RootOracle
  let childOracle: ChildOracle
  let dummyToken: GenericERC20

  const GAUGE_NAME = "Dummy Token X-chain Gauge"
  const GAUGE_SALT = convertGaugeNameToSalt(GAUGE_NAME)

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
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
      await anyCallTranslator.addKnownCallers([
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

  describe("initialize", () => {
    it("Reverts when it is already initialized", async () => {
      await expect(
        anyCallTranslator.initialize(users[0], mockAnyCall.address),
      ).to.be.revertedWith("Initializable: contract is already initialized")
    })
  })

  describe("withdraw", () => {
    it("Successfully withdraws any eth from AnyCall", async () => {
      const amount = 100
      await signers[0].sendTransaction({
        to: mockAnyCall.address,
        value: 100,
      })

      await expect(anyCallTranslator.withdraw(amount)).to.changeEtherBalance(
        anyCallTranslator.address,
        amount,
      )
    })
  })

  describe("rescue", () => {
    it("Successfully rescues ETH", async () => {
      const amount = 100
      await signers[0].sendTransaction({
        to: anyCallTranslator.address,
        value: amount,
      })
      await expect(
        anyCallTranslator.rescue(ZERO_ADDRESS, users[0], 0),
      ).to.changeEtherBalance(users[0], amount)
    })

    it("Successfully rescues specific amount of ETH", async () => {
      const amount = 100
      await signers[0].sendTransaction({
        to: anyCallTranslator.address,
        value: amount * 2,
      })
      await expect(
        anyCallTranslator.rescue(ZERO_ADDRESS, users[0], amount),
      ).to.changeEtherBalance(users[0], amount)
    })

    it("Successfully rescues ERC20", async () => {
      await dummyToken.mint(
        anyCallTranslator.address,
        BIG_NUMBER_1E18.mul(10000),
      )

      await expect(
        anyCallTranslator.rescue(dummyToken.address, users[0], 0),
      ).to.changeTokenBalances(
        dummyToken,
        [users[0], anyCallTranslator.address],
        [BIG_NUMBER_1E18.mul(10000), BIG_NUMBER_1E18.mul(-10000)],
      )
    })

    it("Successfully rescues specific amounts of ERC20", async () => {
      await dummyToken.mint(
        anyCallTranslator.address,
        BIG_NUMBER_1E18.mul(10000),
      )

      await expect(
        anyCallTranslator.rescue(dummyToken.address, users[0], BIG_NUMBER_1E18),
      ).to.changeTokenBalances(
        dummyToken,
        [users[0], anyCallTranslator.address],
        [BIG_NUMBER_1E18, BIG_NUMBER_1E18.mul(-1)],
      )
    })

    it("Reverts when called by non-owner", async () => {
      await expect(
        anyCallTranslator
          .connect(signers[10])
          .rescue(dummyToken.address, users[0], BIG_NUMBER_1E18),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("setAnyCall", () => {
    it("Successfully sets AnyCall address", async () => {
      await anyCallTranslator.setAnyCall(mockAnyCall.address)
    })
    it("Reverts when given address doesnt have executor() function", async () => {
      await expect(anyCallTranslator.setAnyCall(ZERO_ADDRESS)).to.be.reverted
    })
  })

  describe("addKnownCallers", () => {
    it("Successfully adds known callers", async () => {
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.false
      await anyCallTranslator.addKnownCallers([users[10]])
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.true
    })
    it("Successfully adds multiple known callers", async () => {
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.false
      expect(await anyCallTranslator.isKnownCaller(users[11])).to.be.false

      await anyCallTranslator.addKnownCallers([users[10], users[11]])
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.true
      expect(await anyCallTranslator.isKnownCaller(users[11])).to.be.true
    })
  })

  describe("removeKnownCallers", () => {
    beforeEach(async () => {
      await anyCallTranslator.addKnownCallers([users[10], users[11]])
    })
    it("Successfully removes known callers", async () => {
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.true
      await anyCallTranslator.removeKnownCallers([users[10]])
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.false
    })
    it("Successfully removes multiple known callers", async () => {
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.true
      expect(await anyCallTranslator.isKnownCaller(users[11])).to.be.true

      await anyCallTranslator.removeKnownCallers([users[10], users[11]])
      expect(await anyCallTranslator.isKnownCaller(users[10])).to.be.false
      expect(await anyCallTranslator.isKnownCaller(users[11])).to.be.false
    })
  })

  describe("anyCall", () => {
    it("Reverts when caller is not known", async () => {
      await expect(
        anyCallTranslator.anyCall(
          mockAnyCall.address,
          [],
          ZERO_ADDRESS,
          TEST_SIDE_CHAIN_ID,
          0,
        ),
      ).to.be.revertedWith("Unknown caller")
    })

    it("Successfully sends a message to itself to AnyCall", async () => {
      await anyCallTranslator.addKnownCallers([users[0]])

      const anyCallTo = users[0]
      const anyCallData: Bytes = []
      const flags = 0

      await expect(
        anyCallTranslator.anyCall(
          anyCallTo,
          anyCallData,
          ZERO_ADDRESS,
          TEST_SIDE_CHAIN_ID,
          flags,
        ),
      )
        .to.emit(mockAnyCall, "AnyCallMessage")
        .withArgs(
          anyCallTranslator.address, // address AnyCallProxy will call
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [anyCallTo, anyCallData],
          ), // data AnyCallProxy will pass as data
          ZERO_ADDRESS,
          TEST_SIDE_CHAIN_ID,
          flags,
        )
    })
  })

  describe("anyExecute", () => {
    it("Reverts when caller is not anyCall executor", async () => {
      await expect(anyCallTranslator.anyExecute([])).to.be.revertedWith(
        "Caller is not anyCall executor",
      )
    })

    it("Reverts when caller.contexct() is not anyCallTranslator itself", async () => {
      const executor = await impersonateAccount(mockAnyCall.address)
      await setEtherBalance(
        await executor.getAddress(),
        ethers.constants.WeiPerEther.mul(100),
      )

      // Set straoge slot 0 variable (anyCallTranslator) to a random address
      await helpers.setStorageAt(mockAnyCall.address, 0, users[10])

      await expect(
        anyCallTranslator.connect(executor).anyExecute([]),
      ).to.be.revertedWith("Wrong context")
    })

    it("Successfully processes toAndData and calls the target function", async () => {
      const executor = await impersonateAccount(mockAnyCall.address)
      await setEtherBalance(
        await executor.getAddress(),
        ethers.constants.WeiPerEther.mul(100),
      )

      const sdl = await ethers.getContract("SDL")
      const functionData = sdl.interface.encodeFunctionData("totalSupply")

      const toAndData = ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [sdl.address, functionData],
      ) // data AnyCallProxy will pass as data

      const sdlBalance = await sdl.totalSupply()
      const [success, returnData] = await anyCallTranslator
        .connect(executor)
        .callStatic.anyExecute(toAndData)

      expect(success).to.be.true
      expect(returnData).to.eq(sdlBalance)

      // Check that the function was called
      await anyCallTranslator.connect(executor).anyExecute(toAndData)
    })

    it("Reverts when the target call fails due to target contract error", async () => {
      const executor = await impersonateAccount(mockAnyCall.address)
      await setEtherBalance(
        await executor.getAddress(),
        ethers.constants.WeiPerEther.mul(100),
      )

      const sdl = await ethers.getContract("SDL")
      const functionData = sdl.interface.encodeFunctionData("totalSupply")

      const toAndData = ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes"],
        [mockAnyCall.address, functionData],
      ) // data AnyCallProxy will pass as data
      await expect(
        anyCallTranslator.connect(executor).anyExecute(toAndData),
      ).to.be.revertedWith("Target call failed")
    })
  })

  describe("Root chain", () => {
    it("RGF.deploy_child_gauge() sends a message to AnyCall w/ encoded function data for CGF.deploy_gauge()", async () => {
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
          TEST_SIDE_CHAIN_ID,
          DUMMY_TOKEN_ADDRESS,
          GAUGE_SALT,
          GAUGE_NAME,
          GAUGE_OWNER,
        ),
      )
        .to.emit(mockAnyCall, "AnyCallMessage")
        .withArgs(
          anyCallTranslator.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [rootGaugeFactory.address, callData],
          ),
          ZERO_ADDRESS,
          TEST_SIDE_CHAIN_ID,
          0,
        )
    })

    it("RootOracle.push() sends a message to AnyCall w/ encoded function data for ChildOracle.receive()", async () => {
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
      const callData = childOracle.interface.encodeFunctionData("receive", [
        userPoint,
        globalPoint,
        users[0],
      ])

      await expect(rootOracle["push(uint256)"](TEST_SIDE_CHAIN_ID))
        .to.emit(mockAnyCall, "AnyCallMessage")
        .withArgs(
          anyCallTranslator.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [rootOracle.address, callData],
          ),
          ZERO_ADDRESS,
          TEST_SIDE_CHAIN_ID,
          0,
        )
    })

    it("AnyCall successfully executes RGF.deploy_gauge()", async () => {
      const callData = rootGaugeFactory.interface.encodeFunctionData(
        "deploy_gauge",
        [TEST_SIDE_CHAIN_ID, GAUGE_SALT, GAUGE_NAME],
      )
      const implementation = await rootGaugeFactory.get_implementation()

      // Expect RootGaugeFactory to emit DeployedGauge event
      await expect(
        mockAnyCall.callAnyExecute(
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
          TEST_SIDE_CHAIN_ID,
          anyCallTranslator.address,
          GAUGE_SALT,
          anyValue,
        )

      // Expect there is a new gauge deployed
      expect(await rootGaugeFactory.get_gauge_count(TEST_SIDE_CHAIN_ID)).to.eq(
        1,
      )
    })
  })

  describe("Side chain", () => {
    it("AnyCall successfully executes CGF.deploy_gauge() which sends a message to AnyCall w/ encoded function data for RGF.deploy_gauge()", async () => {
      const DUMMY_TOKEN_ADDRESS = dummyToken.address
      const GAUGE_OWNER = users[0]

      const callData = childGaugeFactory.interface.encodeFunctionData(
        "deploy_gauge(address,bytes32,string,address)",
        [DUMMY_TOKEN_ADDRESS, GAUGE_SALT, GAUGE_NAME, GAUGE_OWNER],
      )

      // The expected call data for creating root gauge on mainnet
      const expectedCallDataRoot =
        rootGaugeFactory.interface.encodeFunctionData("deploy_gauge", [
          31337,
          GAUGE_SALT,
          GAUGE_NAME,
        ])

      await expect(
        mockAnyCall.callAnyExecute(
          anyCallTranslator.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [childGaugeFactory.address, callData],
          ),
        ),
      )
        .to.emit(mockAnyCall, "AnyCallMessage")
        .withArgs(
          anyCallTranslator.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [childGaugeFactory.address, expectedCallDataRoot],
          ),
          ZERO_ADDRESS,
          1, // Expect the message to be sent to mainnet
          0,
        )
        .and.emit(childGaugeFactory, "DeployedGauge")
    })

    it("AnyCall successfully executes ChildOracle.receive()", async () => {
      // Pretend this is data that was sent from mainnet
      const userPoint = {
        bias: 1,
        slope: 2,
        ts: 3,
      }

      const globalPoint = {
        bias: 4,
        slope: 5,
        ts: 6,
      }

      // receive((int128,int128,uint256),(int128,int128,uint256),address)
      const callData = childOracle.interface.encodeFunctionData("receive", [
        userPoint,
        globalPoint,
        users[0],
      ])

      await expect(
        mockAnyCall.callAnyExecute(
          anyCallTranslator.address,
          ethers.utils.defaultAbiCoder.encode(
            ["address", "bytes"],
            [childOracle.address, callData],
          ),
        ),
      )
        .to.emit(childOracle, "Receive")
        .withArgs(
          Object.values(userPoint),
          Object.values(globalPoint),
          users[0],
        )
    })
  })
})
