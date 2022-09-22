import { setNextBlockBaseFeePerGas } from "@nomicfoundation/hardhat-network-helpers"
import chai from "chai"
import { Signer } from "ethers"
import { deployments, network } from "hardhat"
import { ArbitrumBridger, SDL } from "../../build/typechain"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"
import {
  BIG_NUMBER_1E18,
  getWithName,
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
} from "../testUtils"

const { execute } = deployments

const { expect } = chai

describe("ArbitrumBridger", () => {
  let signers: Array<Signer>
  let users: string[]
  let arbitrumBridger: ArbitrumBridger
  let sdl: SDL

  const gasLimit = 1000000
  const gasPrice = 990000000
  const TEST_ADDRESS = "0x00000000000000000000000000000000DeaDBeef"

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
              ignoreUnknownTxType: true,
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
        gasLimit,
        gasPrice,
        sdl.address,
      )) as ArbitrumBridger
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
        .withArgs([gasLimit, gasPrice], [newGasLimit, newGasPrice])
    })
  })

  describe("commitTransferOwnership", () => {
    it(`Reverts when not called by the owner`, async () => {
      await expect(
        arbitrumBridger
          .connect(signers[1])
          .commitTransferOwnership(TEST_ADDRESS),
      ).to.be.reverted
    })

    it(`Successfully sets futureOwner`, async () => {
      await arbitrumBridger.commitTransferOwnership(TEST_ADDRESS)
      expect(await arbitrumBridger.futureOwner()).to.eq(TEST_ADDRESS)
    })
  })

  describe("acceptTransferOwnership", () => {
    it(`Reverts when not called by the futureOwner`, async () => {
      await expect(
        arbitrumBridger.connect(signers[1]).acceptTransferOwnership(),
      ).to.be.reverted
    })

    it(`Successfully transfers ownership to futureOwner`, async () => {
      await arbitrumBridger.commitTransferOwnership(users[10])
      await expect(
        arbitrumBridger.connect(signers[10]).acceptTransferOwnership(),
      )
        .to.emit(arbitrumBridger, "TransferOwnership")
        .withArgs(users[0], users[10])
      expect(await arbitrumBridger.owner()).to.eq(users[10])
    })
  })

  describe("bridge", () => {
    it(`Successfully Sends SDL to Arbitrum Router`, async () => {
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

      // Approve bridger to use users[0]'s SDL
      await sdl.approve(arbitrumBridger.address, MAX_UINT256)
      // Set base fee for consistent test result
      await setNextBlockBaseFeePerGas(10653818828)
      // Expect the bridge call to successfully transfer SDL token to the router
      await expect(
        arbitrumBridger.bridge(
          sdl.address,
          users[0],
          BIG_NUMBER_1E18.mul(10000),
          {
            value: await arbitrumBridger["cost(uint256)"](10653818828),
          },
        ),
      ).to.changeTokenBalance(sdl, users[0], BIG_NUMBER_1E18.mul(-10000))
    })
  })

  describe("commitTransferOwnership", () => {
    it(`Reverts when not called by the owner`, async () => {
      await expect(
        arbitrumBridger
          .connect(signers[1])
          .commitTransferOwnership(TEST_ADDRESS),
      ).to.be.reverted
    })

    it(`Successfully sets futureOwner`, async () => {
      await arbitrumBridger.commitTransferOwnership(TEST_ADDRESS)
      expect(await arbitrumBridger.futureOwner()).to.eq(TEST_ADDRESS)
    })
  })

  describe("acceptTransferOwnership", () => {
    it(`Reverts when not called by the futureOwner`, async () => {
      await expect(
        arbitrumBridger.connect(signers[1]).acceptTransferOwnership(),
      ).to.be.reverted
    })

    it(`Successfully transfers ownership to futureOwner`, async () => {
      await arbitrumBridger.commitTransferOwnership(users[10])
      await expect(
        arbitrumBridger.connect(signers[10]).acceptTransferOwnership(),
      )
        .to.emit(arbitrumBridger, "TransferOwnership")
        .withArgs(users[0], users[10])
      expect(await arbitrumBridger.owner()).to.eq(users[10])
    })
  })
})
