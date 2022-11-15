import { setNextBlockBaseFeePerGas } from "@nomicfoundation/hardhat-network-helpers"
import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments, ethers, network } from "hardhat"
import {
  AnyCallExecutor,
  ArbitrumBridger,
  GaugeController,
  MockAnyCall,
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
} from "../../testUtils"

const { expect } = chai

/**
 * Test the ArbitrumBridger contract
 *
 * Forks mainnet for testing if bridging is successful on eth mainnet side
 * Note that tx on destination can still fail due to low fee submission
 * Also tests for bridging interaction by the anycall executor
 */
describe("ArbitrumBridger", () => {
  let signers: Array<Signer>
  let users: string[]
  let arbitrumBridger: ArbitrumBridger
  let gaugeController: GaugeController
  let rgf: RootGaugeFactory
  let rgfOwner: Signer
  let sdl: SDL
  let rootGauge: RootGauge

  const GAS_LIMIT = 1000000
  const GAS_PRICE = 990000000

  const TEST_GAUGE_NAME = "testGauge"

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

      const bridgerFactory = await ethers.getContractFactory("ArbitrumBridger")
      arbitrumBridger = (await bridgerFactory.deploy(
        GAS_LIMIT,
        GAS_PRICE,
        sdl.address,
      )) as ArbitrumBridger

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
        .set_bridger(CHAIN_ID.ARBITRUM_MAINNET, arbitrumBridger.address)

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

  describe("check", () => {
    it(`Returns true`, async () => {
      expect(await arbitrumBridger.check(users[0])).to.eq(true)
    })
  })

  describe("gasLimit", () => {
    it(`Returns expected gas limit`, async () => {
      expect(await arbitrumBridger.gasLimit()).to.eq(GAS_LIMIT)
    })
  })

  describe("gasPrice", () => {
    it(`Returns expected gas price`, async () => {
      expect(await arbitrumBridger.gasPrice()).to.eq(GAS_PRICE)
    })
  })

  describe("pause", () => {
    it(`Pauses contract`, async () => {
      await arbitrumBridger.pause()
      expect(await arbitrumBridger.paused()).to.eq(true)
    })

    it(`Reverts if called by non-owner`, async () => {
      await expect(
        arbitrumBridger.connect(signers[1]).pause(),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("unpause", () => {
    beforeEach(async () => {
      await arbitrumBridger.pause()
      expect(await arbitrumBridger.paused()).to.eq(true)
    })
    it(`Unpauses contract`, async () => {
      await arbitrumBridger.unpause()
      expect(await arbitrumBridger.paused()).to.eq(false)
    })
    it(`Reverts if called by non-owner`, async () => {
      await expect(
        arbitrumBridger.connect(signers[1]).unpause(),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("cost", () => {
    it(`Returns correct estimation for gas cost`, async () => {
      // Provide base fee for hardhat workaround
      // https://github.com/NomicFoundation/hardhat/issues/1688
      expect(await arbitrumBridger["cost(uint256)"]("10653818828")).to.eq(
        "1068582567675328",
      )
    })

    it(`Returns lower value when basefee is zero`, async () => {
      // https://github.com/NomicFoundation/hardhat/issues/1688
      // Since basefee is 0 on view functions, we expect to see lower value than above
      expect(await arbitrumBridger["cost()"]()).to.eq("990000000000000")
    })
  })

  describe("setSubmissionData", () => {
    it(`Emits UpdateSubmissionData event and sets submission data`, async () => {
      const newGasLimit = 2000000
      const newGasPrice = 990000000
      await expect(arbitrumBridger.setSubmissionData(newGasLimit, newGasPrice))
        .to.emit(arbitrumBridger, "UpdateSubmissionData")
        .withArgs([GAS_LIMIT, GAS_PRICE], [newGasLimit, newGasPrice])
    })

    it(`Reverts when called by non-owner`, async () => {
      await expect(
        arbitrumBridger
          .connect(signers[1])
          .setSubmissionData(2000000, 990000000),
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

    it(`Reverts when paused`, async () => {
      await arbitrumBridger.pause()
      await expect(
        arbitrumBridger.bridge(users[0], users[1], BIG_NUMBER_1E18.mul(100)),
      ).to.be.revertedWith("Pausable: paused")
    })

    it(`Successfully Sends SDL to Arbitrum Router`, async () => {
      // Approve bridger to use users[0]'s SDL
      await sdl.approve(arbitrumBridger.address, MAX_UINT256)
      // Set base fee for consistent test result
      await setNextBlockBaseFeePerGas(10)
      // Expect the bridge call to successfully transfer SDL token to the router
      await expect(
        arbitrumBridger.bridge(
          sdl.address,
          users[0],
          BIG_NUMBER_1E18.mul(10000),
          {
            value: await arbitrumBridger["cost(uint256)"](10),
            gasPrice: 10,
          },
        ),
      ).to.changeTokenBalance(sdl, users[0], BIG_NUMBER_1E18.mul(-10000))
    })

    it(`Successfully Sends SDL to Arbitrum Router with excess gas`, async () => {
      // Approve bridger to use users[0]'s SDL
      await sdl.approve(arbitrumBridger.address, MAX_UINT256)
      // Set base fee for consistent test result
      await setNextBlockBaseFeePerGas(10)
      // Expect the bridge call to successfully transfer SDL token to the router
      // Extra 10 ETH is sent to the router but is sent back to the owner
      await expect(
        arbitrumBridger.bridge(
          sdl.address,
          users[0],
          BIG_NUMBER_1E18.mul(10000),
          {
            value: (
              await arbitrumBridger["cost(uint256)"](10)
            ).add(ethers.utils.parseEther("10")),
            gasPrice: 10,
          },
        ),
      )
        .to.changeTokenBalance(sdl, users[0], BIG_NUMBER_1E18.mul(-10000))
        .and.changeEtherBalance(users[0], "-990000000073760")
      // expect the balance only changed by 0.00099 ETH
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

    it("AnyCall executor calls transmit_emissions()", async () => {
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

      // Fund root gauge to have some eth for bridging
      await setEtherBalance(rootGauge.address, ethers.utils.parseEther("1"))

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
