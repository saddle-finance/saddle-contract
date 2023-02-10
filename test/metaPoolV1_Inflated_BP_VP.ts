import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import MetaSwapV1Artifact from "../build/artifacts/contracts/meta/MetaSwapV1.sol/MetaSwapV1.json"
import SwapV2Artifact from "../build/artifacts/contracts/SwapV2.sol/SwapV2.json"
import {
  AmplificationUtilsV2,
  GenericERC20,
  LPTokenV2,
  MetaSwapDepositV1,
  MetaSwapUtilsV1,
  MetaSwapV1,
  SwapUtilsV2,
  SwapV2,
} from "../build/typechain"
import {
  asyncForEach,
  deployContractWithLibraries,
  getUserTokenBalance,
  getUserTokenBalances,
  MAX_UINT256,
} from "./testUtils"

const { expect } = chai

describe("Meta-SwapV1 with inflated baseVirtualPrice", async () => {
  let signers: Array<Signer>
  let baseSwap: SwapV2
  let metaSwap: MetaSwapV1
  let metaSwapDeposit: MetaSwapDepositV1
  let amplificationUtilsV2: AmplificationUtilsV2
  let swapUtilsV2: SwapUtilsV2
  let metaSwapUtilsV1: MetaSwapUtilsV1
  let firstToken: LPTokenV2
  let susd: GenericERC20
  let dai: GenericERC20
  let usdc: GenericERC20
  let usdt: GenericERC20
  let baseLPToken: GenericERC20
  let metaLPToken: LPTokenV2
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let ownerAddress: string
  let user1Address: string
  let user2Address: string

  // Test Values
  const TOKEN_DECIMALS = [18, 6, 6]
  const INITIAL_A_VALUE = 2000
  const SWAP_FEE = 4e6 // 0.04%
  const ADMIN_FEE = 0 // 0%
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"

  const AMOUNT = 1e17
  const INFLATED_VP = "1013335719282759415"

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { get } = deployments
      await deployments.fixture(["Swap", "USDPool", "MetaSwapUtils"])
      signers = await ethers.getSigners()
      owner = signers[0]
      user1 = signers[1]
      user2 = signers[2]
      ownerAddress = await owner.getAddress()
      user1Address = await user1.getAddress()
      user2Address = await user2.getAddress()

      // Deploy Swap Libraries
      amplificationUtilsV2 = (await (
        await ethers.getContractFactory("AmplificationUtilsV2")
      ).deploy()) as AmplificationUtilsV2
      await amplificationUtilsV2.deployed()
      swapUtilsV2 = (await (
        await ethers.getContractFactory("SwapUtilsV2")
      ).deploy()) as SwapUtilsV2
      await swapUtilsV2.deployed()

      // Deploy Base Swap
      baseSwap = (await deployContractWithLibraries(owner, SwapV2Artifact, {
        SwapUtilsV2: swapUtilsV2.address,
        AmplificationUtilsV2: amplificationUtilsV2.address,
      })) as SwapV2
      await baseSwap.deployed()

      // Deploy instance of LPTokenV2
      firstToken = (await (
        await ethers.getContractFactory("LPTokenV2")
      ).deploy()) as LPTokenV2
      firstToken.initialize("Test Token", "TEST")

      dai = await ethers.getContract("DAI")
      usdc = await ethers.getContract("USDC")
      usdt = await ethers.getContract("USDT")

      await baseSwap.initialize(
        [dai.address, usdc.address, usdt.address],
        TOKEN_DECIMALS,
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        ADMIN_FEE,
        firstToken.address,
      )

      baseLPToken = (await ethers.getContractAt(
        GenericERC20Artifact.abi,
        (
          await baseSwap.swapStorage()
        ).lpToken,
      )) as GenericERC20

      // Deploy dummy tokens
      susd = (await (
        await ethers.getContractFactory("GenericERC20", owner)
      ).deploy("Synthetix USD", "sUSD", "18")) as GenericERC20

      // Mint tokens
      await asyncForEach(
        [ownerAddress, user1Address, user2Address],
        async (address) => {
          await dai.mint(address, BigNumber.from(10).pow(18).mul(100000))
          await usdc.mint(address, BigNumber.from(10).pow(6).mul(100000))
          await usdt.mint(address, BigNumber.from(10).pow(6).mul(100000))
          await susd.mint(address, BigNumber.from(10).pow(18).mul(100000))
        },
      )

      // Deploy MetaSwapV1 and MetaSwapUtilsV1 library
      metaSwapUtilsV1 = (await (
        await ethers.getContractFactory("MetaSwapUtilsV1", owner)
      ).deploy()) as MetaSwapUtilsV1

      metaSwap = (await deployContractWithLibraries(owner, MetaSwapV1Artifact, {
        SwapUtilsV2: swapUtilsV2.address,
        MetaSwapUtilsV1: metaSwapUtilsV1.address,
        AmplificationUtilsV2: amplificationUtilsV2.address,
      })) as MetaSwapV1
      await metaSwap.deployed()

      // Set approvals
      await asyncForEach([owner, user1, user2], async (signer) => {
        await susd.connect(signer).approve(metaSwap.address, MAX_UINT256)
        await dai.connect(signer).approve(metaSwap.address, MAX_UINT256)
        await usdc.connect(signer).approve(metaSwap.address, MAX_UINT256)
        await usdt.connect(signer).approve(metaSwap.address, MAX_UINT256)
        await dai.connect(signer).approve(baseSwap.address, MAX_UINT256)
        await usdc.connect(signer).approve(baseSwap.address, MAX_UINT256)
        await usdt.connect(signer).approve(baseSwap.address, MAX_UINT256)
        await baseLPToken.connect(signer).approve(metaSwap.address, MAX_UINT256)

        // Add some liquidity to the base pool
        await baseSwap
          .connect(signer)
          .addLiquidity(
            [String(1e20), String(1e8), String(1e8)],
            0,
            MAX_UINT256,
          )
      })

      // Let's do some swaps to inflate base pool virtual price
      for (let index = 0; index < 100; index++) {
        await baseSwap.connect(user1).swap(0, 1, String(1e20), 0, MAX_UINT256)

        await baseSwap.connect(user1).swap(1, 2, String(1e8), 0, MAX_UINT256)

        await baseSwap.connect(user1).swap(2, 0, String(1e8), 0, MAX_UINT256)
      }

      // that should be inflated enough
      expect(await baseSwap.getVirtualPrice()).to.eq(INFLATED_VP)

      // Initialize meta swap pool
      // Manually overload the signature
      await metaSwap.initializeMetaSwap(
        [susd.address, baseLPToken.address],
        [18, 18],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        ADMIN_FEE,
        firstToken.address,
        baseSwap.address,
      )
      metaLPToken = (await ethers.getContractAt(
        LPTokenArtifact.abi,
        (
          await metaSwap.swapStorage()
        ).lpToken,
      )) as LPTokenV2

      // Approve spending of metaLPToken
      await asyncForEach([owner, user1, user2], async (signer) => {
        await metaLPToken.connect(signer).approve(metaSwap.address, MAX_UINT256)
      })

      // Deploy MetaSwapDeposit contract
      metaSwapDeposit = (await (
        await ethers.getContractFactory("MetaSwapDepositV1", owner)
      ).deploy()) as MetaSwapDepositV1

      // Initialize MetaSwapDeposit
      await metaSwapDeposit.initialize(
        baseSwap.address,
        metaSwap.address,
        metaLPToken.address,
      )

      // Approve token transfers to MetaSwapDeposit
      await asyncForEach([owner, user1, user2], async (signer) => {
        await asyncForEach(
          [susd, dai, usdc, usdt, metaLPToken],
          async (token) => {
            await token
              .connect(signer)
              .approve(metaSwapDeposit.address, MAX_UINT256)
          },
        )
      })

      // Add liquidity to the meta swap pool
      await metaSwap.addLiquidity([INFLATED_VP, String(1e18)], 0, MAX_UINT256)

      expect(await susd.balanceOf(metaSwap.address)).to.eq(INFLATED_VP)
      expect(await baseLPToken.balanceOf(metaSwap.address)).to.eq(String(1e18))

      expect(await metaSwap.getVirtualPrice()).to.eq(String(1e18))
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("addLiquidity", () => {
    it("Virtual price doesn't decrease after depositing only susd", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.addLiquidity([String(AMOUNT), 0], 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after depositing only baseLPToken", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.addLiquidity([0, String(AMOUNT)], 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after depositing only susd via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.addLiquidity(
        [String(AMOUNT), 0, 0, 0],
        0,
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after depositing only dai via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.addLiquidity(
        [0, String(AMOUNT), 0, 0],
        0,
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })
  })

  describe("removeLiquidity", () => {
    it("Virtual price doesn't decrease after removeLiquidity", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.removeLiquidity(String(AMOUNT), [0, 0], MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after removeLiquidity via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.removeLiquidity(
        String(AMOUNT),
        [0, 0, 0, 0],
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })
  })

  describe("removeLiquidityImbalance", () => {
    it("Virtual price doesn't decrease after removeLiquidityImbalance susd", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.removeLiquidityImbalance(
        [String(AMOUNT), 0],
        String(2 * AMOUNT),
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after removeLiquidityImbalance baseLPToken", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.removeLiquidityImbalance(
        [0, String(AMOUNT)],
        String(2 * AMOUNT),
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after removeLiquidityImbalance susd via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.removeLiquidityImbalance(
        [String(AMOUNT), 0, 0, 0],
        String(2 * AMOUNT),
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after removeLiquidityImbalance dai via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.removeLiquidityImbalance(
        [0, String(AMOUNT), 0, 0],
        String(2 * AMOUNT),
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })
  })

  describe("removeLiquidityOneToken", () => {
    it("Virtual price doesn't decrease after removeLiquidityOneToken susd", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.removeLiquidityOneToken(String(AMOUNT), 0, 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after removeLiquidityOneToken baseLPToken", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.removeLiquidityOneToken(String(AMOUNT), 1, 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after removeLiquidityOneToken susd via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.removeLiquidityOneToken(
        String(AMOUNT),
        0,
        0,
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after removeLiquidityOneToken dai via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.removeLiquidityOneToken(
        String(AMOUNT),
        1,
        0,
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })
  })

  describe("swap", () => {
    it("Virtual price doesn't decrease after swap susd -> baseLPToken", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swap(0, 1, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after swap baseLPToken -> susd", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swap(1, 0, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("susd -> baseLPToken -> susd: outcome not great not terrible", async () => {
      const [tokenFromBalanceBefore, tokenToBalanceBefore] =
        await getUserTokenBalances(user1, [susd, baseLPToken])

      await metaSwap.connect(user1).swap(0, 1, String(AMOUNT), 0, MAX_UINT256)

      const tokenToBalanceAfterFirst = await getUserTokenBalance(
        user1,
        baseLPToken,
      )

      await metaSwap
        .connect(user1)
        .swap(
          1,
          0,
          String(tokenToBalanceAfterFirst.sub(tokenToBalanceBefore)),
          0,
          MAX_UINT256,
        )

      const [tokenFromBalanceAfterSecond, tokenToBalanceAfterSecond] =
        await getUserTokenBalances(user1, [susd, baseLPToken])

      // bought & sold exactly the same
      expect(tokenToBalanceBefore).to.eq(tokenToBalanceAfterSecond)

      // can't get more than we started with
      expect(tokenFromBalanceAfterSecond).to.lt(tokenFromBalanceBefore)

      const lossBP = tokenFromBalanceBefore
        .sub(tokenFromBalanceAfterSecond)
        .mul(10000)
        .div(String(AMOUNT))

      // two small swaps should not result in more than 0.1% loss
      expect(lossBP).to.lt(10)
    })
  })

  describe("swapUnderlying", () => {
    it("Virtual price doesn't decrease after swapUnderlying susd -> dai", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swapUnderlying(0, 1, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after swapUnderlying dai -> susd", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swapUnderlying(1, 0, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after swap susd -> dai via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.swap(0, 1, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("Virtual price doesn't decrease after swap dai -> susd via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.swap(1, 0, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })

    it("susd -> dai -> susd: outcome not great not terrible", async () => {
      const [tokenFromBalanceBefore, tokenToBalanceBefore] =
        await getUserTokenBalances(user1, [susd, dai])

      await metaSwap
        .connect(user1)
        .swapUnderlying(0, 1, String(AMOUNT), 0, MAX_UINT256)

      const tokenToBalanceAfterFirst = await getUserTokenBalance(user1, dai)

      await metaSwap
        .connect(user1)
        .swapUnderlying(
          1,
          0,
          String(tokenToBalanceAfterFirst.sub(tokenToBalanceBefore)),
          0,
          MAX_UINT256,
        )

      const [tokenFromBalanceAfterSecond, tokenToBalanceAfterSecond] =
        await getUserTokenBalances(user1, [susd, dai])

      // bought & sold exactly the same
      expect(tokenToBalanceBefore).to.eq(tokenToBalanceAfterSecond)

      // can't get more than we started with
      expect(tokenFromBalanceAfterSecond).to.lt(tokenFromBalanceBefore)

      const lossBP = tokenFromBalanceBefore
        .sub(tokenFromBalanceAfterSecond)
        .mul(10000)
        .div(String(AMOUNT))

      // two small swaps should not result in more than 0.15% loss
      expect(lossBP).to.lt(15)
    })
  })
})
