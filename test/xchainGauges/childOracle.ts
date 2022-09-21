import chai from "chai"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  ChildGaugeFactory,
  ChildOracle,
  RootGaugeFactory,
  RootOracle,
  SDL,
  VotingEscrow,
} from "../../build/typechain"
import { MAX_LOCK_TIME, WEEK } from "../../utils/time"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
  setTimestamp,
} from "../testUtils"
import {
  setupAnyCallTranslator,
  setupChildGaugeFactory,
  setupChildOracle,
  setupRootGaugeFactory,
  setupRootOracle,
} from "./utils"

const { expect } = chai

describe("ChildOracle", () => {
  let signers: Array<Signer>
  let users: string[]
  let rootGaugeFactory: RootGaugeFactory
  let childGaugeFactory: ChildGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let veSDL: VotingEscrow
  let rootOracle: RootOracle
  let childOracle: ChildOracle

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
    },
  )

  async function pushDummyUserPoints() {
    const currentTimestamp = await getCurrentBlockTimestamp()
    const userPoint0 = {
      bias: "5292272140402369232160848",
      slope: "42041442901583344",
      ts: currentTimestamp,
    }
    const userPoint1 = {
      bias: "1067529802746270691066436",
      slope: "33942146860064543",
      ts: currentTimestamp,
    }
    const globalPoint = {
      bias: "39021498196781652278562539",
      slope: "518420477278521359",
      ts: currentTimestamp,
    }

    const owner = await impersonateAccount(anyCallTranslator.address)
    await setEtherBalance(anyCallTranslator.address, BIG_NUMBER_1E18.mul(100))
    await childOracle.connect(owner).receive(userPoint0, globalPoint, users[0])
    await childOracle.connect(owner).receive(userPoint1, globalPoint, users[1])
  }

  beforeEach(async () => {
    await setupTest()
  })

  describe("receive", () => {
    it("Successfully calls receive", async () => {
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

      const owner = await impersonateAccount(anyCallTranslator.address)
      await setEtherBalance(anyCallTranslator.address, BIG_NUMBER_1E18.mul(100))

      await expect(
        childOracle.connect(owner).receive(userPoint, globalPoint, users[0]),
      )
        .to.emit(childOracle, "Receive")
        .withArgs(
          Object.values(userPoint),
          Object.values(globalPoint),
          users[0],
        )
    })
  })

  describe("balanceOf", () => {
    it("Successfully calls balanceOf", async () => {
      // use fixed timestamp for reading ve balances
      await pushDummyUserPoints()
      expect(await childOracle.balanceOf(users[0])).to.be.eq(
        "5292272056319483428994160",
      )
      expect(await childOracle.balanceOf(users[1])).to.be.eq(
        "1067529734861976970937350",
      )
      expect(await childOracle.balanceOf(users[2])).to.be.eq(0)
    })
  })

  describe("totalSupply", () => {
    it("Successfully calls totalSupply", async () => {
      // use fixed timestamp for reading ve balances
      await pushDummyUserPoints()
      expect(await childOracle.totalSupply()).to.be.eq(
        "39021497159940697721519821",
      )
    })
  })

  describe("commitTransferOwnership", () => {
    it(`Reverts when not called by the owner`, async () => {
      await expect(
        childOracle.connect(signers[1]).commitTransferOwnership(TEST_ADDRESS),
      ).to.be.reverted
    })

    it(`Successfully sets futureOwner`, async () => {
      await childOracle.commitTransferOwnership(TEST_ADDRESS)
      expect(await childOracle.futureOwner()).to.eq(TEST_ADDRESS)
    })
  })

  describe("acceptTransferOwnership", () => {
    it(`Reverts when not called by the futureOwner`, async () => {
      await expect(childOracle.connect(signers[1]).acceptTransferOwnership()).to
        .be.reverted
    })

    it(`Successfully transfers ownership to futureOwner`, async () => {
      await childOracle.commitTransferOwnership(users[10])
      await expect(childOracle.connect(signers[10]).acceptTransferOwnership())
        .to.emit(childOracle, "TransferOwnership")
        .withArgs(users[0], users[10])
      expect(await childOracle.owner()).to.eq(users[10])
    })
  })
})
