import chai from "chai"
import { solidity } from "ethereum-waffle"
import { ContractFactory, Signer } from "ethers"
import { deployments, network } from "hardhat"
import {
  AnyCallTranslator,
  ArbitrumBridger,
  ChildGauge,
  GenericERC20,
  LPToken,
  RewardForwarder,
  RootGaugeFactory,
  RootOracle,
  SDL,
  VotingEscrow,
} from "../../build/typechain"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"

import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"
const { execute } = deployments

chai.use(solidity)
const { expect } = chai

describe("RootOracle", () => {
  let signers: Array<Signer>
  let users: string[]
  let user1: Signer
  let deployer: Signer
  let rewardForwarder: RewardForwarder
  let testToken: LPToken
  let firstGaugeToken: GenericERC20
  let lpTokenFactory: ContractFactory
  let rootGaugeFactory: RootGaugeFactory
  let arbitrumBridger: ArbitrumBridger
  let anycallTranslator: AnyCallTranslator
  let childGauge: ChildGauge
  let rootOracle: RootOracle
  let veSDL: VotingEscrow
  let sdl: SDL

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
  const WEEK = 86400 * 7
  const MAXTIME = 86400 * 365 * 4
  const anyCallAddress = "0xC10Ef9F491C9B59f936957026020C321651ac078"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["veSDL"], { fallbackToGlobal: false }) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      user1 = signers[1]
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      // Create SDL lock
      sdl = await ethers.getContract("SDL")
      veSDL = await ethers.getContract("VotingEscrow")

      // Ensure test setup is correct
      if (await sdl.paused()) {
        await sdl.enableTransfer()
      }

      // Set timestamp to start of the week
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK,
      )

      // Create max lock from deployer address
      await sdl.approve(veSDL.address, MAX_UINT256)
      await veSDL.create_lock(
        BIG_NUMBER_1E18.mul(10_000_000),
        (await getCurrentBlockTimestamp()) + MAXTIME,
      )

      // Deploy anycallTranslator
      const anyCallTranslatorFactory = await ethers.getContractFactory(
        "AnyCallTranslator",
      )
      anycallTranslator = (await anyCallTranslatorFactory.deploy(
        users[0],
        anyCallAddress,
      )) as AnyCallTranslator

      // Deploy Root Gauge factory
      const rootGaugeFactoryFactory = await ethers.getContractFactory(
        "RootGaugeFactory",
      )
      rootGaugeFactory = (await rootGaugeFactoryFactory.deploy(
        anycallTranslator.address,
        users[0],
      )) as RootGaugeFactory

      const rootOracleFactory = await ethers.getContractFactory("RootOracle")

      rootOracle = (await rootOracleFactory.deploy(
        rootGaugeFactory.address,
        (
          await ethers.getContract("VeSDLRewards")
        ).address,
        anyCallAddress,
      )) as RootOracle
    },
  )

  beforeEach(async () => {
    await setupTest()
    // fork mainnet
    before(async () => {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl:
                ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] +
                process.env.ALCHEMY_API_KEY,
              blockNumber: 11598050,
            },
          },
        ],
      })

      await setTimestamp(1609896169)
    })
  })

  describe("Initialize RootOracle", () => {
    it(`Successfully initializes`, async () => {
      expect(await rootOracle.callProxy()).to.eq(anyCallAddress)
    })
    // it(`Successfully calls push()`, async () => {
    //   await rootOracle
    //     .connect(anycallTranslator.address)
    //     ["push(uint256)"](42161, { from: anycallTranslator.address })
    // })
  })
})
