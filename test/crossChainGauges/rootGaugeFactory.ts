import chai from "chai"
import { solidity } from "ethereum-waffle"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import {
  SDL,
  VotingEscrow,
  LPToken,
  Swap,
  FeeDistributor,
  RootGaugeFactory,
  RootGauge,
  Minter,
  GaugeController,
  AnyCallTranslator,
} from "../../build/typechain/"
import {
  asyncForEach,
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  increaseTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"

chai.use(solidity)
const { expect } = chai

const WEEK = 86400 * 7
const MAXTIME = 86400 * 365 * 4
const LOCK_START_TIMESTAMP = 2362003200

const USD_V2_SWAP_NAME = "SaddleUSDPoolV2"
const USD_V2_LP_TOKEN_NAME = `${USD_V2_SWAP_NAME}LPToken`
const USD_V2_GAUGE_NAME = `LiquidityGaugeV5_${USD_V2_LP_TOKEN_NAME}`
const VESDL_NAME = "VotingEscrow"

describe("Fee Distributor [ @skip-on-coverage ]", () => {
  let signers: Array<Signer>
  let users: string[]
  let deployer: Signer
  let deployerAddress: string
  let veSDL: VotingEscrow
  let sdl: SDL
  let lpToken: LPToken
  let feeDistributor: FeeDistributor
  let gaugeController: GaugeController
  let rootGaugeFactory: RootGaugeFactory
  let rootGauge: RootGauge
  let minter: Minter
  let anycallTranslator: AnyCallTranslator

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )
      deployerAddress = users[0]

      const swap: Swap = await ethers.getContract(USD_V2_SWAP_NAME)
      anycallTranslator = await ethers.getContract("AnycallTranslator")
      lpToken = await ethers.getContract(USD_V2_LP_TOKEN_NAME)
      veSDL = await ethers.getContract(VESDL_NAME)

      // Root Gauge factory
      const RootGaugeContractFactory = await ethers.getContractFactory(
        "RootGaugeFactory",
      )
      rootGaugeFactory = (await RootGaugeContractFactory.deploy(
        anycallTranslator,
      )) as RootGaugeFactory

      // Root Gauge Implementation
      gaugeController = await ethers.getContract("GaugeController")
      minter = await ethers.getContract("Minter")
      sdl = await ethers.getContract("SDL")
      const gaugeImplementationFactory = await ethers.getContractFactory(
        "RootGauge",
      )
      rootGauge = (await gaugeImplementationFactory.deploy(
        sdl,
        gaugeController,
        minter,
      )) as RootGauge
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("RootGaugeFactory", () => {
    it(`Successfully sets root gauge implementation`, async () => {
      // Initialize checkpoint by calling it first when empty
      await rootGaugeFactory.set_implementation(rootGauge.address)
    })
  })
})
