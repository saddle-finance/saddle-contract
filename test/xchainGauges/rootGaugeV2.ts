import chai, { assert } from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments, ethers, network } from "hardhat"
import {
  GaugeController,
  RootGaugeV2,
  RootGaugeFactory,
  SDL,
} from "../../build/typechain"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
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

const { expect } = chai

describe("RootGaugeV2", () => {
  let signers: Array<Signer>
  let users: string[]
  let arbitrumBridger: string
  let sdl: SDL
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGaugeV2
  let msSigner: Signer

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
              blockNumber: 17119246,
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
      sdl = await ethers.getContractAt("SDL", sdlAddress)
      const gaugeControllerAddress = (
        await getWithName("GaugeController", "mainnet")
      ).address
      const minterAddress = (await getWithName("Minter", "mainnet")).address

      // **** Setup rootGauge Factory ****
      rootGaugeFactory = await ethers.getContractAt(
        "RootGaugeFactory",
        (
          await getWithName("RootGaugeFactory", "mainnet")
        ).address,
      )
      arbitrumBridger = await rootGaugeFactory.get_bridger(
        CHAIN_ID.ARBITRUM_MAINNET,
      )

      // Deploy RootGaugeV2 implementation
      // Root Gauge Implementation
      const gaugeImplementationFactory = await ethers.getContractFactory(
        "RootGaugeV2",
      )
      const rootGaugeV2 = await gaugeImplementationFactory.deploy(
        sdlAddress,
        gaugeControllerAddress,
        minterAddress,
      )

      // set new V2 implementation
      msSigner = await impersonateAccount(MULTISIG_ADDRESSES[CHAIN_ID.MAINNET])
      // Give multisig eth
      await setEtherBalance(
        await msSigner.getAddress(),
        ethers.utils.parseEther("10000"),
      )
      await rootGaugeFactory
        .connect(msSigner)
        .set_implementation(rootGaugeV2.address)

      // Deploy test gauge
      const rootGaugeFactoryGaugeIndex = await rootGaugeFactory.get_gauge_count(
        CHAIN_ID.ARBITRUM_MAINNET,
      )
      await rootGaugeFactory.deploy_gauge(
        CHAIN_ID.ARBITRUM_MAINNET,
        convertGaugeNameToSalt(TEST_GAUGE_NAME),
        TEST_GAUGE_NAME,
      )

      rootGauge = await ethers.getContractAt(
        "RootGaugeV2",
        await rootGaugeFactory.get_gauge(
          CHAIN_ID.ARBITRUM_MAINNET,
          rootGaugeFactoryGaugeIndex,
        ),
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
          arbitrumBridger,
          CHAIN_ID.ARBITRUM_MAINNET,
          TEST_GAUGE_NAME,
        ),
      ).to.be.revertedWith("already initialized")
    })

    it(`Successfully sets storage variables`, async () => {
      expect(await rootGauge.bridger()).to.equal(arbitrumBridger)
      expect(await rootGauge.chain_id()).to.equal(CHAIN_ID.ARBITRUM_MAINNET)
      expect(await rootGauge.name()).to.equal(
        "Saddle " + TEST_GAUGE_NAME + " Root Gauge",
      )
      expect(await rootGauge.factory()).to.equal(rootGaugeFactory.address)
      const inflationParams = await rootGauge.inflation_params()
      expect(inflationParams.rate).to.equal("2066798941798941798")
      expect(inflationParams.finish_time).to.equal("1683579906")
      expect(await rootGauge.last_period()).to.equal("2781")
    })

    it(`Successfully sets storage variables after kill`, async () => {
      expect(await rootGauge.bridger()).to.equal(arbitrumBridger)
      expect(await rootGauge.chain_id()).to.equal(CHAIN_ID.ARBITRUM_MAINNET)
      expect(await rootGauge.name()).to.equal(
        "Saddle " + TEST_GAUGE_NAME + " Root Gauge",
      )
      expect(await rootGauge.factory()).to.equal(rootGaugeFactory.address)
      const inflationParams = await rootGauge.inflation_params()
      expect(inflationParams.rate).to.equal("2066798941798941798")
      expect(inflationParams.finish_time).to.equal("1683579906")
      expect(await rootGauge.last_period()).to.equal("2781")
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
        ["add_gauge(address,int128,uint256)"](
          rootGauge.address,
          0,
          BigNumber.from("1000000000000000000000000"),
        )

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
        "-45569891281176801229234",
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
