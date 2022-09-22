import { setNextBlockBaseFeePerGas } from "@nomicfoundation/hardhat-network-helpers"
import chai from "chai"
import { Signer } from "ethers"
import { deployments, ethers, network } from "hardhat"
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

const { expect } = chai

describe("ArbitrumBridger", () => {
  let signers: Array<Signer>
  let users: string[]
  let arbitrumBridger: ArbitrumBridger
  let sdl: SDL

  const GAS_LIMIT = 1000000
  const GAS_PRICE = 990000000

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
        GAS_LIMIT,
        GAS_PRICE,
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
})
