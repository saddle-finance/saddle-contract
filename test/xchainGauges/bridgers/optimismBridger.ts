import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { getAddress } from "ethers/lib/utils"
import { deployments, ethers, network } from "hardhat"
import {
  AnyCallExecutor,
  GaugeController,
  MockAnyCall,
  OptimismBridger,
  RootGauge,
  RootGaugeFactory,
  SDL,
} from "../../../build/typechain"
import { ANYCALL_ADDRESS, MULTISIG_ADDRESSES } from "../../../utils/accounts"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../../utils/network"
import { WEEK } from "../../../utils/time"
import {
  BIG_NUMBER_1E18,
  convertGaugeNameToSalt,
  getCurrentBlockTimestamp,
  getWithName,
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
  setTimestamp,
  ZERO_ADDRESS,
} from "../../testUtils"

const { expect } = chai

describe("OptimismBridger", () => {
  let signers: Array<Signer>
  let users: string[]
  let optimismBridger: OptimismBridger
  let gaugeController: GaugeController
  let rgf: RootGaugeFactory
  let rgfOwner: Signer
  let sdl: SDL
  let rootGauge: RootGauge
  let sdlAddressOnOptimism: string

  const GAS_LIMIT = 200_000
  const OPTIMISM_L1_BRIDGE_ADDRESS =
    "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1"
  const TEST_GAUGE_NAME = "testGauge"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      // Fork mainnet for testing against Optimism bridge
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl:
                ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] +
                process.env.ALCHEMY_API_KEY,
              blockNumber: 15972819,
            },
          },
        ],
      })

      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => signer.getAddress()),
      )

      sdl = await ethers.getContractAt(
        "SDL",
        (
          await getWithName("SDL", "mainnet")
        ).address,
      )

      // Deploy OptimismBridger
      const bridgerFactory = await ethers.getContractFactory("OptimismBridger")
      optimismBridger = (await bridgerFactory.deploy(
        GAS_LIMIT,
        sdl.address,
        (sdlAddressOnOptimism = await getWithName(
          "SDL",
          "optimism_mainnet",
        ).then((d) => d.address)),
      )) as OptimismBridger

      gaugeController = await ethers.getContractAt(
        "GaugeController",
        (
          await getWithName("GaugeController", "mainnet")
        ).address,
      )

      rgf = await ethers.getContractAt(
        "RootGaugeFactory",
        (
          await getWithName("RootGaugeFactory", "mainnet")
        ).address,
      )

      // Set as the bridger for destination network
      rgfOwner = await impersonateAccount(await rgf.owner())
      await setEtherBalance(await rgf.owner(), ethers.utils.parseEther("100"))
      await rgf
        .connect(rgfOwner)
        .set_bridger(CHAIN_ID.ARBITRUM_MAINNET, optimismBridger.address)

      // Deploy a root gauge for destination network
      const receipt = await rgf
        .deploy_gauge(
          CHAIN_ID.ARBITRUM_MAINNET,
          convertGaugeNameToSalt(TEST_GAUGE_NAME),
          TEST_GAUGE_NAME,
        )
        .then((tx) => tx.wait())

      // Find root gauge address from event logs
      const gaugeAddress: string = receipt.events?.find(
        (e) => e.event === "DeployedGauge",
      )?.args?._gauge
      rootGauge = await ethers.getContractAt("RootGauge", gaugeAddress)
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

  describe("cost", () => {
    it(`Returns 0`, async () => {
      expect(await optimismBridger.cost()).to.eq(0)
    })
  })

  describe("check", () => {
    it(`Returns true`, async () => {
      expect(await optimismBridger.check(users[0])).to.eq(true)
    })
  })

  describe("setGasLimit", () => {
    it(`Emits UpdateGasLimit event and sets gas limit`, async () => {
      const newGasLimit = 400_000
      await expect(optimismBridger.setGasLimit(newGasLimit))
        .to.emit(optimismBridger, "UpdateGasLimit")
        .withArgs(GAS_LIMIT, newGasLimit)
    })

    it(`Reverts when called by non-owner`, async () => {
      const newGasLimit = 400_000
      await expect(
        optimismBridger.connect(signers[1]).setGasLimit(newGasLimit),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("setL2TokenPair", () => {
    it(`Emits UpdateSubmissionData event and sets submission data`, async () => {
      const usdcMainnet = await getWithName("USDC", "mainnet").then(
        (d) => d.address,
      )
      const usdcOptimism = await getWithName("USDC", "optimism_mainnet").then(
        (d) => d.address,
      )
      await expect(optimismBridger.setL2TokenPair(usdcMainnet, usdcOptimism))
        .to.emit(optimismBridger, "UpdateTokenMapping")
        .withArgs(
          getAddress(usdcMainnet),
          ZERO_ADDRESS,
          getAddress(usdcOptimism),
        )
    })

    it(`Removes any approval for l1 token when l2 address is zero`, async () => {
      await expect(optimismBridger.setL2TokenPair(sdl.address, ZERO_ADDRESS))
        .to.emit(optimismBridger, "UpdateTokenMapping")
        .withArgs(
          getAddress(sdl.address),
          getAddress(sdlAddressOnOptimism),
          ZERO_ADDRESS,
        )
      expect(
        await sdl.allowance(
          optimismBridger.address,
          OPTIMISM_L1_BRIDGE_ADDRESS,
        ),
      ).to.be.eq(0)
    })

    it(`Reverts when called by non-owner`, async () => {
      await expect(
        optimismBridger
          .connect(signers[10])
          .setL2TokenPair(sdl.address, ZERO_ADDRESS),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("bridge", () => {
    beforeEach(async () => {
      // Give some SDL to users[0]
      const sdlHolder = await impersonateAccount(
        MULTISIG_ADDRESSES[CHAIN_ID.MAINNET],
      )
      await setEtherBalance(
        await sdlHolder.getAddress(),
        BIG_NUMBER_1E18.mul(100),
      )
      await sdl
        .connect(sdlHolder)
        .transfer(users[0], BIG_NUMBER_1E18.mul(10000))
    })

    it(`Successfully Sends SDL to Optimism Bridge`, async () => {
      // Approve bridger to use users[0]'s SDL
      await sdl.approve(optimismBridger.address, MAX_UINT256)
      // Expect the bridge call to successfully transfer SDL token to the router
      await expect(
        optimismBridger.bridge(
          sdl.address,
          users[0],
          BIG_NUMBER_1E18.mul(10000),
        ),
      ).to.changeTokenBalance(sdl, users[0], BIG_NUMBER_1E18.mul(-10000))
    })

    it(`Reverts when using token without l2 token pair`, async () => {
      // Deploy a dummy token
      const dummyToken = await ethers
        .getContractFactory("GenericERC20")
        .then((f) => f.deploy("Dummy", "DUM", 18))
      await dummyToken.mint(users[0], BIG_NUMBER_1E18.mul(10000))
      // Approve bridger to use users[0]'s DUM
      await dummyToken.approve(optimismBridger.address, MAX_UINT256)
      // Expect the bridge call to be reverted
      await expect(
        optimismBridger.bridge(
          dummyToken.address,
          users[0],
          BIG_NUMBER_1E18.mul(10000),
        ),
      ).to.be.revertedWith("L2 token not set")
    })
  })

  describe("Works as a bridger for a RootGauge", () => {
    beforeEach(async () => {
      const gaugeControllerOwner = await gaugeController.admin()
      await setEtherBalance(gaugeControllerOwner, BIG_NUMBER_1E18.mul(100))
      const gaugeControllerOwnerSigner = await impersonateAccount(
        gaugeControllerOwner,
      )
      await gaugeController
        .connect(gaugeControllerOwnerSigner)
        ["add_gauge(address,int128,uint256)"](
          rootGauge.address,
          0,
          BIG_NUMBER_1E18.mul(1_000_000),
        )
      // Skip time to next wednesday + 1 week
      // A full week of rewards must accumulate before bridging can occur
      await setTimestamp(
        Math.floor(((await getCurrentBlockTimestamp()) + WEEK) / WEEK) * WEEK +
          WEEK,
      )
    })

    it("AnyCall can trigger RGF.transmit_emissions()", async () => {
      const anyCall: MockAnyCall = await ethers.getContractAt(
        "MockAnyCall",
        ANYCALL_ADDRESS,
      )

      // Find AnyCall executor contract
      const anyCallExecutorAddress = await anyCall.executor()
      const anyCallExecutor: AnyCallExecutor = await ethers.getContractAt(
        "AnyCallExecutor",
        anyCallExecutorAddress,
      )

      // Find AnyCallExecutor creator address and fund it
      const anyCallExecutorCreator = await anyCallExecutor.creator()
      await setEtherBalance(
        anyCallExecutorCreator,
        ethers.utils.parseEther("1"),
      )
      const anyCallExecutorCreatorSigner = await impersonateAccount(
        anyCallExecutorCreator,
      )

      // Find AnyCallTranslator deployment
      const anyCallTranslator = await getWithName(
        "AnyCallTranslator",
        "mainnet",
      )

      // Format calldata in same format as from ChildGaugeFactory
      const calldata = rgf.interface.encodeFunctionData("transmit_emissions", [
        rootGauge.address,
      ])

      // Expect the call to be successful
      await expect(
        anyCallExecutor
          .connect(anyCallExecutorCreatorSigner)
          .execute(
            anyCallTranslator.address,
            ethers.utils.defaultAbiCoder.encode(
              ["address", "bytes"],
              [rgf.address, calldata],
            ),
            anyCallTranslator.address,
            CHAIN_ID.ARBITRUM_MAINNET,
            200,
          ),
      ).to.changeTokenBalance(
        sdl,
        (
          await getWithName("Minter", "mainnet")
        ).address,
        BigNumber.from("-374560041094590653579319"),
      )
    })
  })
})
