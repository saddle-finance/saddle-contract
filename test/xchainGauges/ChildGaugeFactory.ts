import chai, { assert } from "chai"
import { solidity } from "ethereum-waffle"
import { Signer } from "ethers"
import { deployments } from "hardhat"
import {
  AnyCallTranslator,
  RootGauge,
  RootGaugeFactory,
} from "../../build/typechain"

import { ZERO_ADDRESS } from "../testUtils"

chai.use(solidity)
const { expect } = chai

describe("ChildGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGauge
  let anycallTranslator: AnyCallTranslator

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

      // Deploy anycallTranslator
      const anyCallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anyCallTranslatorFactory.deploy(
        anyCallAddress,
      )) as AnyCallTranslator

      // Root Gauge factory
      const rootGaugeFactoryFactory = await ethers.getContractFactory(
        "ChildGaugeFactory",
      )
      rootGaugeFactory = (await rootGaugeFactoryFactory.deploy(
        anycallTranslator.address,
        (
          await ethers.getContract("SDL")
        ).address,
        users[0],
      )) as RootGaugeFactory

      // Root Gauge Implementation
      const gaugeImplementationFactory = await ethers.getContractFactory(
        "ChildGauge",
      )
      rootGauge = (await gaugeImplementationFactory.deploy(
        (
          await ethers.getContract("SDL")
        ).address,
        rootGaugeFactory.address,
      )) as RootGauge
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize RootGaugeFactory", () => {
    it(`Successfully sets root gauge implementation`, async () => {
      return
    })
  })
})
