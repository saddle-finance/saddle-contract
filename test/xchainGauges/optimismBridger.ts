import chai from "chai"
import { Signer } from "ethers"
import { getAddress } from "ethers/lib/utils"
import { deployments, ethers, network } from "hardhat"
import { OptimismBridger, SDL } from "../../build/typechain"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"
import {
  BIG_NUMBER_1E18,
  getWithName,
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
  ZERO_ADDRESS,
} from "../testUtils"

const { expect } = chai

describe("OptimismBridger", () => {
  let signers: Array<Signer>
  let users: string[]
  let optimismBridger: OptimismBridger
  let sdl: SDL
  let sdlAddressOnOptimism: string

  const GAS_LIMIT = 200_000
  const OPTIMISM_L1_BRIDGE_ADDRESS =
    "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1"

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
              blockNumber: 15542718,
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
      expect(await optimismBridger.check()).to.eq(true)
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
})
