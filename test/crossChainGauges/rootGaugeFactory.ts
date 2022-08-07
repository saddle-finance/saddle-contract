import chai, { assert } from "chai"
import { solidity } from "ethereum-waffle"
import { Signer } from "ethers"
import { deployments } from "hardhat"

import { AnyCallTranslator } from "../../build/typechain/contracts/crossChainGauges/AnycallTranslator.sol"
import { RootGauge } from "../../build/typechain/contracts/crossChainGauges/implementations/RootGauge.vy"
import { RootGaugeFactory } from "../../build/typechain/contracts/crossChainGauges/RootGaugeFactory.vy"
import { ZERO_ADDRESS } from "../testUtils"

chai.use(solidity)
const { expect } = chai

describe("RootGaugeFactory", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGauge
  let anycallTranslator: AnyCallTranslator

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      console.log("test")
      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Replace with mock address unless being tested on forked mainnet
      const anyCallAddress = "0x0000000000000000000000000000000000000000"

      // Replace with mock address unless being tested on forked mainnet
      const bridgerAddress = "0x0000000000000000000000000000000000000000"

      // Deploy anycallTranslator
      const anyCallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anyCallTranslatorFactory.deploy(
        anyCallAddress,
      )) as AnyCallTranslator
      console.log("test")

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

  beforeEach(async () => {
    await setupTest()
  })

  describe("Initialize RootGaugeFactory", () => {
    it(`Successfully sets root gauge implementation`, async () => {
      const tx = await rootGaugeFactory.set_implementation(rootGauge.address)
      console.log(tx)
      // expect(tx).to.have.property("UpdateImplementation")
      // expect(tx.events["UpdateImplementation"]).to.eq([
      //   ZERO_ADDRESS,
      //   rootGauge.address,
      // ])
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
      await rootGaugeFactory.set_bridger(
        2222,
        "0x0000000000000000000000000000000000000000",
      )
      expect(await rootGaugeFactory.get_bridger(2222)).to.eq(
        "0x0000000000000000000000000000000000000000",
      )
    })
  })

  describe("Deploy with RootGaugeFactory", () => {
    it(`Successfully sets root gauge implementation`, async () => {
      await rootGaugeFactory.set_implementation(rootGauge.address)
      expect(await rootGaugeFactory.get_implementation()).to.eq(
        rootGauge.address,
      )
    })
  })
})
