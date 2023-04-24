import chai, { assert } from "chai"
import { Signer } from "ethers"
import { deployments, ethers, network } from "hardhat"
import {
  AnyCallTranslator,
  ArbitrumBridger,
  GaugeController,
  RootGaugeV2,
  RootGaugeFactory,
  SDL,
  VotingEscrow,
  Minter,
} from "../../build/typechain"
import { ANYCALL_ADDRESS, MULTISIG_ADDRESSES } from "../../utils/accounts"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"
import {
  BIG_NUMBER_1E18,
  convertGaugeNameToSalt,
  getCurrentBlockTimestamp,
  getWithName,
  impersonateAccount,
  setEtherBalance,
  setTimestamp,
} from "../testUtils"
import { setupAnyCallTranslator, setupRootGaugeFactoryV2 } from "./utils"

const { expect } = chai

describe("RootGaugeV2", () => {
  let signers: Array<Signer>
  let users: string[]
  let arbitrumBridger: ArbitrumBridger
  let vesdl: VotingEscrow
  let sdl: SDL
  let rootGaugeFactory: RootGaugeFactory
  let anyCallTranslator: AnyCallTranslator
  let rootGauge: RootGaugeV2
  let gaugeController: GaugeController
  let minter: Minter

  const GAS_LIMIT = 1000000
  const GAS_PRICE = 990000000
  const TEST_GAUGE_NAME = "testGauge"
  const DAY = 86400
  const WEEK = DAY * 7

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl:
                ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] +
                process.env.ALCHEMY_API_KEY,
              blockNumber: 15542718,
            },
          },
        ],
      })

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Get mainnet addresses

      const sdlAddress = (await getWithName("SDL", "mainnet")).address
      const veSDLAddress = (await getWithName("VotingEscrow", "mainnet"))
        .address
      const gaugeControllerAddress = (
        await getWithName("GaugeController", "mainnet")
      ).address
      gaugeController = await ethers.getContractAt(
        "GaugeController",
        gaugeControllerAddress,
      )

      const minterAddress = (await getWithName("Minter", "mainnet")).address
      sdl = await ethers.getContractAt("SDL", sdlAddress)
      vesdl = await ethers.getContractAt("VotingEscrow", veSDLAddress)
      minter = await ethers.getContractAt("Minter", minterAddress)

      const contracts = await setupAnyCallTranslator(users[0], ANYCALL_ADDRESS)
      anyCallTranslator = contracts.anyCallTranslator

      // **** Setup rootGauge Factory ****
      rootGaugeFactory = await setupRootGaugeFactoryV2(
        anyCallTranslator.address,
        users[0],
        false,
        sdlAddress,
        gaugeControllerAddress,
        minterAddress,
      )
      await anyCallTranslator.addKnownCallers([rootGaugeFactory.address])

      // Deploy and set ArbitrumBridger for forked mainnet testing
      const bridgerFactory = await ethers.getContractFactory("ArbitrumBridger")
      arbitrumBridger = (await bridgerFactory.deploy(
        GAS_LIMIT,
        GAS_PRICE,
        sdl.address,
      )) as ArbitrumBridger
      await rootGaugeFactory.set_bridger(
        CHAIN_ID.ARBITRUM_MAINNET,
        arbitrumBridger.address,
      )

      await rootGaugeFactory.deploy_gauge(
        CHAIN_ID.ARBITRUM_MAINNET,
        convertGaugeNameToSalt(TEST_GAUGE_NAME),
        TEST_GAUGE_NAME,
      )

      rootGauge = await ethers.getContractAt(
        "RootGaugeV2",
        await rootGaugeFactory.get_gauge(CHAIN_ID.ARBITRUM_MAINNET, 0),
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  after(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    })
  })

  describe("initialize", () => {
    it(`Can't initialize twice`, async () => {
      await expect(
        rootGauge.initialize(
          arbitrumBridger.address,
          CHAIN_ID.ARBITRUM_MAINNET,
          TEST_GAUGE_NAME,
        ),
      ).to.be.revertedWith("already initialized")
    })

    it(`Successfully sets storage variables`, async () => {
      expect(await rootGauge.bridger()).to.equal(arbitrumBridger.address)
      expect(await rootGauge.chain_id()).to.equal(CHAIN_ID.ARBITRUM_MAINNET)
      expect(await rootGauge.name()).to.equal(
        "Saddle " + TEST_GAUGE_NAME + " Root Gauge",
      )
      expect(await rootGauge.factory()).to.equal(rootGaugeFactory.address)
      const inflationParams = await rootGauge.inflation_params()
      expect(inflationParams.rate).to.equal("2066798941798941798")
      expect(inflationParams.finish_time).to.equal("1664226306")
      expect(await rootGauge.last_period()).to.equal("2750")
    })

    it(`Successfully sets storage variables after kill`, async () => {
      expect(await rootGauge.bridger()).to.equal(arbitrumBridger.address)
      expect(await rootGauge.chain_id()).to.equal(CHAIN_ID.ARBITRUM_MAINNET)
      expect(await rootGauge.name()).to.equal(
        "Saddle " + TEST_GAUGE_NAME + " Root Gauge",
      )
      expect(await rootGauge.factory()).to.equal(rootGaugeFactory.address)
      const inflationParams = await rootGauge.inflation_params()
      expect(inflationParams.rate).to.equal("2066798941798941798")
      expect(inflationParams.finish_time).to.equal("1664226306")
      expect(await rootGauge.last_period()).to.equal("2750")
      const owner = await impersonateAccount(await rootGaugeFactory.owner())
      await rootGauge.connect(owner).set_killed(true)
      assert(await rootGauge.is_killed())
      expect((await rootGauge.inflation_params()).rate.toString()).to.equal("0")
      // Skip ahead to next week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
      // check that the rate stays 0 after a user_checkpoint
      await rootGauge.user_checkpoint(users[0])
      expect((await rootGauge.inflation_params()).rate.toString()).to.equal("0")
    })
  })

  describe("transmit_emissions", () => {
    it(`Reverts if not called by RootGaugeFactory`, async () => {
      await expect(rootGauge.transmit_emissions()).to.be.reverted
    })

    it(`Reverts when minted is 0`, async () => {
      const owner = await impersonateAccount(rootGaugeFactory.address)
      await setEtherBalance(
        await owner.getAddress(),
        BIG_NUMBER_1E18.mul(10000),
      )
      await expect(rootGauge.connect(owner).transmit_emissions()).to.be.reverted
    })

    it(`Successfully mints SDL and calls Bridger.bridge()`, async () => {
      // Impersonate root gauge owner and multisig
      const owner = await impersonateAccount(rootGaugeFactory.address)
      const multisig = await impersonateAccount(
        MULTISIG_ADDRESSES[CHAIN_ID.MAINNET],
      )
      await setEtherBalance(
        await owner.getAddress(),
        BIG_NUMBER_1E18.mul(10000),
      )
      await setEtherBalance(
        await multisig.getAddress(),
        BIG_NUMBER_1E18.mul(10000),
      )
      // Add root gauge to gauge controller
      const gaugeController: GaugeController = await ethers.getContractAt(
        "GaugeController",
        (
          await getWithName("GaugeController", "mainnet")
        ).address,
      )
      await gaugeController
        .connect(multisig)
        ["add_gauge(address,int128,uint256)"](rootGauge.address, 0, 10000)

      // Skip ahead to next week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
      // Emissions need to wait a week to be transmitted
      // Expected below to revert since nothing is minted
      await expect(rootGauge.connect(owner).transmit_emissions()).to.be.reverted

      // Skip ahead to next week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
      // Transmit emissions. Since bridging is not free for arbitrum, we need to
      // supply eth to root gauge first.
      await signers[0].sendTransaction({
        to: rootGauge.address,
        value: BIG_NUMBER_1E18,
      })
      await expect(
        rootGauge.connect(owner).transmit_emissions(),
      ).to.changeTokenBalance(
        sdl,
        await getWithName("Minter", "mainnet").then((c) => c.address),
        "-624968751562421878465214",
      )
    })

    it(`Reverts when minting SDL when killed`, async () => {
      // Impersonate root gauge owner and multisig
      const owner = await impersonateAccount(rootGaugeFactory.address)
      const multisig = await impersonateAccount(
        MULTISIG_ADDRESSES[CHAIN_ID.MAINNET],
      )
      await setEtherBalance(
        await owner.getAddress(),
        BIG_NUMBER_1E18.mul(10000),
      )
      await setEtherBalance(
        await multisig.getAddress(),
        BIG_NUMBER_1E18.mul(10000),
      )
      // Add root gauge to gauge controller
      const gaugeController: GaugeController = await ethers.getContractAt(
        "GaugeController",
        (
          await getWithName("GaugeController", "mainnet")
        ).address,
      )
      await gaugeController
        .connect(multisig)
        ["add_gauge(address,int128,uint256)"](rootGauge.address, 0, 10000)

      // Skip ahead to next week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
      // Emissions need to wait a week to be transmitted
      // Expected below to revert since nothing is minted
      await expect(rootGauge.connect(owner).transmit_emissions()).to.be.reverted

      // Skip ahead to next week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )
      // Transmit emissions. Since bridging is not free for arbitrum, we need to
      // supply eth to root gauge first.
      await signers[0].sendTransaction({
        to: rootGauge.address,
        value: BIG_NUMBER_1E18,
      })
      const factoryOwner = await impersonateAccount(
        await rootGaugeFactory.owner(),
      )
      await rootGauge.connect(factoryOwner).set_killed(true)
      await expect(rootGauge.connect(owner).transmit_emissions()).to.be.reverted
      await expect(await sdl.balanceOf(rootGauge.address)).to.deep.equal("0")
    })
  })
})
