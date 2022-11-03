import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import chai from "chai"
import { Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
  ChildOracle,
  MockAnyCall,
  RootGaugeFactory,
  RootOracle,
  SDL,
  VotingEscrow,
} from "../../build/typechain"
import { MAX_LOCK_TIME } from "../../utils/time"

import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
  ZERO_ADDRESS,
} from "../testUtils"
import {
  setupAnyCallTranslator,
  setupRootGaugeFactory,
  setupRootOracle,
  TEST_SIDE_CHAIN_ID,
} from "./utils"

const { expect } = chai

describe("RootOracle", () => {
  let signers: Array<Signer>
  let users: string[]
  let rootGaugeFactory: RootGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let rootOracle: RootOracle
  let veSDL: VotingEscrow
  let mockAnyCall: MockAnyCall
  let userPoint: ChildOracle.PointStruct
  let globalPoint: ChildOracle.PointStruct

  const WEEK = 86400 * 7
  const TEST_ADDRESS = "0x00000000000000000000000000000000DeaDBeef"

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

      // **** Add expected callers to known callers ****
      anyCallTranslator.addKnownCallers([
        rootGaugeFactory.address,
        rootOracle.address,
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

      // Save user point of users[0] and global point
      const returnData = await veSDL.callStatic.user_point_history(
        users[0],
        veSDL.callStatic.user_point_epoch(users[0]),
      )
      const returnDataGlobal = await veSDL.callStatic.point_history(
        veSDL.callStatic.epoch(),
      )
      userPoint = {
        bias: returnData.bias,
        slope: returnData.slope,
        ts: returnData.ts,
      }
      globalPoint = {
        bias: returnDataGlobal.bias,
        slope: returnDataGlobal.slope,
        ts: returnDataGlobal.ts,
      }
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("constructor", () => {
    it(`Successfully sets FACTORY`, async () => {
      expect(await rootOracle.FACTORY()).to.eq(rootGaugeFactory.address)
    })
    it(`Successfully sets VE`, async () => {
      expect(await rootOracle.VE()).to.eq(
        (await ethers.getContract("VotingEscrow")).address,
      )
    })
    it(`Successfully sets callProxy`, async () => {
      expect(await rootOracle.callProxy()).to.eq(anyCallTranslator.address)
    })
  })

  describe("push(uint256 _chainId)", () => {
    it(`Successfully requests a cross chain message`, async () => {
      const callData = (
        await ethers.getContractFactory("ChildOracle")
      ).interface.encodeFunctionData("receive", [
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

    it(`Reverts when the account has no ve balance`, async () => {
      await expect(
        rootOracle.connect(signers[10])["push(uint256)"](TEST_SIDE_CHAIN_ID),
      ).to.be.revertedWith("No ve balance")
    })
  })

  describe("push(uint256 _chainId, address _user)", () => {
    it(`Successfully requests a cross chain message`, async () => {
      const callData = (
        await ethers.getContractFactory("ChildOracle")
      ).interface.encodeFunctionData("receive", [
        userPoint,
        globalPoint,
        users[0],
      ])

      await expect(
        rootOracle["push(uint256,address)"](TEST_SIDE_CHAIN_ID, users[0]),
      )
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

    it(`Reverts when the account has no ve balance`, async () => {
      await expect(
        rootOracle["push(uint256,address)"](TEST_SIDE_CHAIN_ID, users[10]),
      ).to.be.revertedWith("No ve balance")
    })
  })

  describe("setCallProxy", () => {
    it(`Reverts when not called by the owner`, async () => {
      await expect(
        rootOracle.connect(signers[1]).setCallProxy(TEST_ADDRESS),
      ).to.be.revertedWith("not owner")
    })

    it(`Successfully sets callProxy`, async () => {
      await expect(rootOracle.setCallProxy(TEST_ADDRESS))
        .to.emit(rootOracle, "UpdateCallProxy")
        .withArgs(anyValue, TEST_ADDRESS)
      expect(await rootOracle.callProxy()).to.eq(TEST_ADDRESS)
    })
  })

  describe("commitTransferOwnership", () => {
    it(`Reverts when not called by the owner`, async () => {
      await expect(
        rootOracle.connect(signers[1]).commitTransferOwnership(TEST_ADDRESS),
      ).to.be.reverted
    })

    it(`Successfully sets futureOwner`, async () => {
      await rootOracle.commitTransferOwnership(TEST_ADDRESS)
      expect(await rootOracle.futureOwner()).to.eq(TEST_ADDRESS)
    })
  })

  describe("acceptTransferOwnership", () => {
    it(`Reverts when not called by the futureOwner`, async () => {
      await expect(rootOracle.connect(signers[1]).acceptTransferOwnership()).to
        .be.reverted
    })

    it(`Successfully transfers ownership to futureOwner`, async () => {
      await rootOracle.commitTransferOwnership(users[10])
      await expect(rootOracle.connect(signers[10]).acceptTransferOwnership())
        .to.emit(rootOracle, "TransferOwnership")
        .withArgs(users[0], users[10])
      expect(await rootOracle.owner()).to.eq(users[10])
    })
  })
})
