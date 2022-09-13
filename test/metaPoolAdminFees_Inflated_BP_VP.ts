import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import MetaSwapArtifact from "../build/artifacts/contracts/meta/MetaSwap.sol/MetaSwap.json"
import {
  GenericERC20,
  LPToken,
  MetaSwap,
  MetaSwapDeposit,
  MetaSwapUtils,
  Swap,
} from "../build/typechain/"
import {
  asyncForEach,
  deployContractWithLibraries,
  getUserTokenBalance,
  getUserTokenBalances,
  MAX_UINT256,
} from "./testUtils"

const { expect } = chai

describe("Meta-Swap with inflated baseVirtualPrice and 50% admin fees", async () => {
  let signers: Array<Signer>
  let baseSwap: Swap
  let metaSwap: MetaSwap
  let metaSwapUtils: MetaSwapUtils
  let metaSwapDeposit: MetaSwapDeposit
  let susd: GenericERC20
  let dai: GenericERC20
  let usdc: GenericERC20
  let usdt: GenericERC20
  let baseLPToken: GenericERC20
  let metaLPToken: LPToken
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let ownerAddress: string
  let user1Address: string
  let user2Address: string

  // Test Values
  const INITIAL_A_VALUE = 2000
  const SWAP_FEE = 4e6 // 0.04%
  const ADMIN_FEE = 5e9 // 50%
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

      // Get deployed Swap
      baseSwap = await ethers.getContract("Swap")

      dai = await ethers.getContract("DAI")
      usdc = await ethers.getContract("USDC")
      usdt = await ethers.getContract("USDT")

      await baseSwap.initialize(
        [dai.address, usdc.address, usdt.address],
        [18, 6, 6],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        0,
        (
          await get("LPToken")
        ).address,
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

      // Deploy Swap with SwapUtils library
      metaSwap = (await deployContractWithLibraries(owner, MetaSwapArtifact, {
        SwapUtils: (await get("SwapUtils")).address,
        MetaSwapUtils: (await get("MetaSwapUtils")).address,
        AmplificationUtils: (await get("AmplificationUtils")).address,
      })) as MetaSwap
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
        (
          await get("LPToken")
        ).address,
        baseSwap.address,
      )
      metaLPToken = (await ethers.getContractAt(
        LPTokenArtifact.abi,
        (
          await metaSwap.swapStorage()
        ).lpToken,
      )) as LPToken

      // Approve spending of metaLPToken
      await asyncForEach([owner, user1, user2], async (signer) => {
        await metaLPToken.connect(signer).approve(metaSwap.address, MAX_UINT256)
      })

      // Deploy MetaSwapDeposit contract
      metaSwapDeposit = (await (
        await ethers.getContractFactory("MetaSwapDeposit", owner)
      ).deploy()) as MetaSwapDeposit

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
    const expectedAdminFeeValueBaseLPToken = BigNumber.from(2e13)

    it("Virtual price doesn't decrease after swap susd -> baseLPToken", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swap(0, 1, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      // We expect the increase in admin balance of base LP token to be valued at
      // swap value * 50% * 0.04%
      // Since the values aren't exact due to approximations, we test against +-0.01% delta
      const adminFeeValue = (await metaSwap.getAdminBalance(1))
        .mul(INFLATED_VP)
        .div(String(1e18))
      expect(adminFeeValue)
        .gte(
          expectedAdminFeeValueBaseLPToken
            .mul(String(9999e14))
            .div(String(1e18)),
        )
        .and.lte(
          expectedAdminFeeValueBaseLPToken
            .mul(String(10001e14))
            .div(String(1e18)),
        )
      console.log(
        `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueBaseLPToken}`,
      )
    })

    it("Virtual price doesn't decrease after swap baseLPToken -> susd", async () => {
      const expectedDepositedBaseLpTokenAmount =
        await baseSwap.callStatic.addLiquidity(
          [String(AMOUNT), 0, 0],
          0,
          MAX_UINT256,
        )

      const expectedSwapValue = expectedDepositedBaseLpTokenAmount
        .mul(INFLATED_VP)
        .div(String(1e18))
      const expectedAdminFeeValueSUSD = expectedSwapValue
        .mul(2e14)
        .div(String(1e18))

      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swap(
        1,
        0,
        expectedDepositedBaseLpTokenAmount,
        0,
        MAX_UINT256,
      )
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      // We expect the increase in admin balance of susd to be valued at
      // swap value * 50% * 0.04%
      // Since the values aren't exact due to approximations, we test against +-0.05% delta
      const adminFeeValue = await metaSwap.getAdminBalance(0)
      expect(adminFeeValue)
        .gte(expectedAdminFeeValueSUSD.mul(String(9999e14)).div(String(1e18)))
        .and.lte(
          expectedAdminFeeValueSUSD.mul(String(10001e14)).div(String(1e18)),
        )
      console.log(
        `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueSUSD}`,
      )
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
    const expectedAdminFeeValueBaseLPToken = BigNumber.from(2e13)

    it("Virtual price doesn't decrease after swapUnderlying susd -> dai", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swapUnderlying(0, 1, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      const adminFeeValue = (await metaSwap.getAdminBalance(1))
        .mul(INFLATED_VP)
        .div(String(1e18))
      expect(adminFeeValue)
        .gte(
          expectedAdminFeeValueBaseLPToken
            .mul(String(9999e14))
            .div(String(1e18)),
        )
        .and.lte(
          expectedAdminFeeValueBaseLPToken
            .mul(String(10001e14))
            .div(String(1e18)),
        )
      console.log(
        `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueBaseLPToken}`,
      )
    })

    it("Virtual price doesn't decrease after swapUnderlying dai -> susd", async () => {
      const expectedDepositedBaseLpTokenAmount =
        await baseSwap.callStatic.addLiquidity(
          [String(AMOUNT), 0, 0],
          0,
          MAX_UINT256,
        )
      const expectedSwapValue = expectedDepositedBaseLpTokenAmount
        .mul(INFLATED_VP)
        .div(String(1e18))
      const expectedAdminFeeValueSUSD = expectedSwapValue
        .mul(2e14)
        .div(String(1e18))

      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap.swapUnderlying(1, 0, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      const adminFeeValue = await metaSwap.getAdminBalance(0)
      expect(adminFeeValue)
        .gte(expectedAdminFeeValueSUSD.mul(String(9999e14)).div(String(1e18)))
        .and.lte(
          expectedAdminFeeValueSUSD.mul(String(10001e14)).div(String(1e18)),
        )
      console.log(
        `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueSUSD}`,
      )
    })

    it("Virtual price doesn't decrease after swap susd -> dai via MetaSwapDeposit", async () => {
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.swap(0, 1, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      const adminFeeValue = (await metaSwap.getAdminBalance(1))
        .mul(INFLATED_VP)
        .div(String(1e18))
      expect(adminFeeValue)
        .gte(
          expectedAdminFeeValueBaseLPToken
            .mul(String(9999e14))
            .div(String(1e18)),
        )
        .and.lte(
          expectedAdminFeeValueBaseLPToken
            .mul(String(10001e14))
            .div(String(1e18)),
        )
      console.log(
        `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueBaseLPToken}`,
      )
    })

    it("Virtual price doesn't decrease after swap dai -> susd via MetaSwapDeposit", async () => {
      const expectedDepositedBaseLpTokenAmount =
        await baseSwap.callStatic.addLiquidity(
          [String(AMOUNT), 0, 0],
          0,
          MAX_UINT256,
        )
      const expectedSwapValue = expectedDepositedBaseLpTokenAmount
        .mul(INFLATED_VP)
        .div(String(1e18))
      const expectedAdminFeeValueSUSD = expectedSwapValue
        .mul(2e14)
        .div(String(1e18))

      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwapDeposit.swap(1, 0, String(AMOUNT), 0, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      const adminFeeValue = await metaSwap.getAdminBalance(0)
      expect(adminFeeValue)
        .gte(expectedAdminFeeValueSUSD.mul(String(9999e14)).div(String(1e18)))
        .and.lte(
          expectedAdminFeeValueSUSD.mul(String(10001e14)).div(String(1e18)),
        )
      console.log(
        `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueSUSD}`,
      )
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
