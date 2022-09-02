import chai from "chai"
import { BigNumber, Contract, Signer } from "ethers"
import { deployments } from "hardhat"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"
import { GenericERC20, LPToken, MetaSwap, Swap } from "../../build/typechain/"
import {
  asyncForEach,
  BIG_NUMBER_1E18,
  BIG_NUMBER_ZERO,
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
} from "../../test/testUtils"

const { expect } = chai

const META_SWAP_ADDRESS = "0x824dcD7b044D60df2e89B1bB888e66D8BCf41491"
const TOKEN_HOLDERS = [
  "0xa5407eae9ba41422680e2e00537571bcc53efbfd", // AMM
  "0x691ef79e40d909c715be5e9e93738b3ff7d58534", // MiniChef
]
const UNWRAPPED_POOLED_TOKEN_LENGTH = 4
const FORKING_JSON_RPC_URL =
  ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] + process.env.ALCHEMY_API_KEY
const DEPOSIT_AMOUNT = 1_000

interface SwapStorage {
  initialA: BigNumber
  futureA: BigNumber
  initialATime: BigNumber
  futureATime: BigNumber
  swapFee: BigNumber
  adminFee: BigNumber
  lpToken: string
}

describe("MetaSwap", async () => {
  let signers: Array<Signer>
  let users: string[]
  let metaSwap: MetaSwap
  let baseSwap: Swap
  let swapToken: LPToken
  const pooledTokens: GenericERC20[] = []
  const pooledTokenDecimals: number[] = []
  const baseTokens: GenericERC20[] = []
  const baseTokenDecimals: number[] = []
  let unwrappedTokenDecimals: number[]
  let owner: Signer
  let swapStorage: SwapStorage
  let depositAmounts: BigNumber[]

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture([], {
        keepExistingDeployments: true,
        fallbackToGlobal: false,
      })
      signers = await ethers.getSigners()
      users = await Promise.all(
        signers.map(async (signer) => await signer.getAddress()),
      )

      await setEtherBalance(users[1], 1e20)

      // Try to get the swap contract at the address
      metaSwap = await ethers.getContractAt("MetaSwap", META_SWAP_ADDRESS)
      owner = await impersonateAccount(await metaSwap.owner())
      await setEtherBalance(await owner.getAddress(), 1e20)

      // If it is paused, unpause it
      if (await metaSwap.paused()) {
        await metaSwap.connect(owner).unpause()
      }

      for (let i = 0; i < 10; i++) {
        try {
          pooledTokens.push(
            await ethers.getContractAt(
              "GenericERC20",
              await metaSwap.getToken(i),
            ),
          )
          pooledTokenDecimals.push(await pooledTokens[i].decimals())
        } catch (e) {
          break
        }
      }
      depositAmounts = pooledTokenDecimals.map((decimals) => {
        return BigNumber.from(10).pow(decimals).mul(DEPOSIT_AMOUNT)
      })

      // Pooled tokens should be greater than 0. If not, its not a valid swap contract or its not initialized yet
      expect(pooledTokens.length).to.be.greaterThan(0)
      expect(pooledTokens.length).to.be.eq(TOKEN_HOLDERS.length)

      // Transfer pooled tokens from TOKEN_HOLDERS to users[1] for testing
      await asyncForEach(pooledTokens, async (token, i) => {
        const impersonatedSigner = await impersonateAccount(TOKEN_HOLDERS[i])
        await setEtherBalance(await impersonatedSigner.getAddress(), 1e20)
        await token
          .connect(impersonatedSigner)
          .transfer(users[1], await token.balanceOf(TOKEN_HOLDERS[i]))
        // Check that the transfer was successful and the balance is greater than 0
        expect(await token.balanceOf(users[1])).to.be.gt(0)
        await token.connect(signers[1]).approve(metaSwap.address, MAX_UINT256)
      })

      swapStorage = await metaSwap.swapStorage()
      swapToken = (await ethers.getContractAt(
        "LPToken",
        swapStorage.lpToken,
      )) as LPToken

      // Add some liquidity to the swap contract and set up for tests
      await metaSwap
        .connect(signers[1])
        .addLiquidity(depositAmounts, 0, MAX_UINT256)

      // Approve lp token to be burned for when removing liquidity
      await swapToken.connect(signers[1]).approve(metaSwap.address, MAX_UINT256)

      // Get base swap information
      baseSwap = (await ethers.getContractAt(
        "Swap",
        (
          await (metaSwap as Contract as MetaSwap).metaSwapStorage()
        ).baseSwap,
      )) as Swap
      const baseSwapStorage = await baseSwap.swapStorage()
      const baseSwapToken = (await ethers.getContractAt(
        "LPToken",
        baseSwapStorage.lpToken,
      )) as LPToken

      // Approve base swap lp token to be burned for when removing liquidity
      await baseSwapToken
        .connect(signers[1])
        .approve(baseSwap.address, MAX_UINT256)

      // Get base tokens and decimals. Then approve base tokens to be swapped using swapUnderlying
      for (let i = 0; i < 10; i++) {
        try {
          baseTokens.push(
            await ethers.getContractAt(
              "GenericERC20",
              await baseSwap.getToken(i),
            ),
          )
          baseTokenDecimals.push(await baseTokens[i].decimals())
          await baseTokens[i]
            .connect(signers[1])
            .approve(metaSwap.address, MAX_UINT256)
        } catch (e) {
          break
        }
      }

      unwrappedTokenDecimals = [pooledTokenDecimals[0], ...baseTokenDecimals]
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("addLiquidity", () => {
    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      it(`Virtual price doesn't decrease after depositing only one token at index ${i}`, async () => {
        const amounts = Array(depositAmounts.length).fill(BIG_NUMBER_ZERO)
        amounts[i] = depositAmounts[i]
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.connect(signers[1]).addLiquidity(amounts, 0, MAX_UINT256)
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    }
  })

  describe("removeLiquidity", () => {
    it("Virtual price doesn't decrease after removeLiquidity", async () => {
      const expectedAmounts = Array(depositAmounts.length).fill(BIG_NUMBER_ZERO)
      const virtualPriceBefore = await metaSwap.getVirtualPrice()
      await metaSwap
        .connect(signers[1])
        .removeLiquidity(BIG_NUMBER_1E18, expectedAmounts, MAX_UINT256)
      expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })
  })

  describe("removeLiquidityImbalance", () => {
    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      it("Virtual price doesn't decrease after removeLiquidityImbalance", async () => {
        const amounts = [...depositAmounts.map((amount) => amount.div(2))]
        amounts[i] = BIG_NUMBER_ZERO
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap
          .connect(signers[1])
          .removeLiquidityImbalance(
            amounts,
            await swapToken.balanceOf(users[1]),
            MAX_UINT256,
          )
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    }
  })

  describe("removeLiquidityOneToken", () => {
    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      it(`Virtual price doesn't decrease after removeLiquidityOneToken at index ${i}`, async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap
          .connect(signers[1])
          .removeLiquidityOneToken(
            BigNumber.from(10).pow(18),
            i,
            0,
            MAX_UINT256,
          )
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    }
  })

  describe("swap", () => {
    const swapAmount = BIG_NUMBER_1E18

    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      for (let j = 0; j < TOKEN_HOLDERS.length; j++) {
        if (i === j) continue
        it(`Virtual price doesn't decrease after swap (${i} -> ${j})`, async () => {
          const virtualPriceBefore = await metaSwap.getVirtualPrice()
          await metaSwap
            .connect(signers[1])
            .swap(i, j, swapAmount, 0, MAX_UINT256)
          expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
        })
      }
    }
  })

  describe("swapUnderlying", () => {
    const swapAmount = 100
    const removeBaseLiquidityAmount = BIG_NUMBER_1E18.mul(10000)

    for (let i = 0; i < UNWRAPPED_POOLED_TOKEN_LENGTH; i++) {
      for (let j = 0; j < UNWRAPPED_POOLED_TOKEN_LENGTH; j++) {
        if (i === j) continue
        it(`Virtual price doesn't decrease after swapUnderlying (${i} -> ${j})`, async () => {
          // Get some of the tokens by removing liquidity from the base pool
          const minBaseAmounts = Array(baseTokens.length).fill(BIG_NUMBER_ZERO)
          await baseSwap
            .connect(signers[1])
            .removeLiquidity(
              removeBaseLiquidityAmount,
              minBaseAmounts,
              MAX_UINT256,
            )

          const virtualPriceBefore = await metaSwap.getVirtualPrice()
          await metaSwap
            .connect(signers[1])
            .swapUnderlying(
              i,
              j,
              BigNumber.from(10).pow(unwrappedTokenDecimals[i]).mul(swapAmount),
              0,
              MAX_UINT256,
            )
          expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
        })
      }
    }
  })
})
