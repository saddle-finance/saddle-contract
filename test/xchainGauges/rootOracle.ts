import chai from "chai"
import { Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  AnyCallTranslator,
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
} from "../testUtils"
import {
  setupAnyCallTranslator,
  setupRootGaugeFactory,
  setupRootOracle,
} from "./utils"

const { expect } = chai

describe("RootOracle", () => {
  let signers: Array<Signer>
  let users: string[]
  let rootGaugeFactory: RootGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let rootOracle: RootOracle
  let veSDL: VotingEscrow

  const WEEK = 86400 * 7
  const MAXTIME = 86400 * 365 * 4
  const anyCallAddress = "0xC10Ef9F491C9B59f936957026020C321651ac078"

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
})