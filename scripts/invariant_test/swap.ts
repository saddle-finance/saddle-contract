import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { deployments } from "hardhat"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"
import { GenericERC20, LPToken, Swap } from "../../build/typechain/"
import {
  asyncForEach,
  BIG_NUMBER_1E18,
  BIG_NUMBER_ZERO,
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
} from "../../test/testUtils"

const { expect } = chai

const SWAP_ADDRESS = "0xC69DDcd4DFeF25D8a793241834d4cc4b3668EAD6"
const TOKEN_HOLDERS = [
  "0x43b4fdfd4ff969587185cdb6f0bd875c5fc83f8c", // AMM
  "0x9928e4046d7c6513326ccea028cd3e7a91c7590a", // AMM
  "0xd632f22692fac7611d2aa1c0d552930d43caed3b", // AMM
  "0x66017d22b0f8556afdd19fc67041899eb65a21bb", // LUSD stability pool
]

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

describe("Swap", async () => {
  let signers: Array<Signer>
  let users: string[]
  let swap: Swap
  let swapToken: LPToken
  const pooledTokens: GenericERC20[] = []
  const pooledTokenDecimals: number[] = []
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

      await setEtherBalance(users[1], ethers.constants.WeiPerEther.mul(10_000))

      // Try to get the swap contract at the address
      swap = await ethers.getContractAt("Swap", SWAP_ADDRESS)
      owner = await impersonateAccount(await swap.owner())
      await setEtherBalance(
        await owner.getAddress(),
        ethers.constants.WeiPerEther.mul(10_000),
      )

      // If it is paused, unpause it
      if (await swap.paused()) {
        await swap.connect(owner).unpause()
      }

      for (let i = 0; i < 10; i++) {
        try {
          pooledTokens.push(
            await ethers.getContractAt("GenericERC20", await swap.getToken(i)),
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
      console.log(`pooledTokens: ${pooledTokens}`)

      // Transfer pooled tokens from TOKEN_HOLDERS to users[1] for testing
      await asyncForEach(pooledTokens, async (token, i) => {
        const impersonatedSigner = await impersonateAccount(TOKEN_HOLDERS[i])
        await setEtherBalance(
          await impersonatedSigner.getAddress(),
          ethers.constants.WeiPerEther.mul(10_000),
        )
        await token
          .connect(impersonatedSigner)
          .transfer(users[1], await token.balanceOf(TOKEN_HOLDERS[i]))
        // Check that the transfer was successful and the balance is greater than 0
        expect(await token.balanceOf(users[1])).to.be.gt(0)
        await token.connect(signers[1]).approve(swap.address, MAX_UINT256)
      })

      swapStorage = await swap.swapStorage()
      swapToken = (await ethers.getContractAt(
        "LPToken",
        swapStorage.lpToken,
      )) as LPToken

      // Add some liquidity to the swap contract and set up for tests
      await swap
        .connect(signers[1])
        .addLiquidity(depositAmounts, 0, MAX_UINT256)

      // Approve lp token to be burned for when removing liquidity
      await swapToken.connect(signers[1]).approve(swap.address, MAX_UINT256)
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
        const virtualPriceBefore = await swap.getVirtualPrice()
        await swap.connect(signers[1]).addLiquidity(amounts, 0, MAX_UINT256)
        expect(await swap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    }
  })

  describe("removeLiquidity", () => {
    it("Virtual price doesn't decrease after removeLiquidity", async () => {
      const expectedAmounts = Array(depositAmounts.length).fill(BIG_NUMBER_ZERO)
      const virtualPriceBefore = await swap.getVirtualPrice()
      await swap
        .connect(signers[1])
        .removeLiquidity(BIG_NUMBER_1E18, expectedAmounts, MAX_UINT256)
      expect(await swap.getVirtualPrice()).to.gte(virtualPriceBefore)
    })
  })

  describe("removeLiquidityImbalance", () => {
    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      it("Virtual price doesn't decrease after removeLiquidityImbalance", async () => {
        const amounts = [...depositAmounts.map((amount) => amount.div(2))]
        amounts[i] = BIG_NUMBER_ZERO
        const virtualPriceBefore = await swap.getVirtualPrice()
        await swap
          .connect(signers[1])
          .removeLiquidityImbalance(
            amounts,
            await swapToken.balanceOf(users[1]),
            MAX_UINT256,
          )
        expect(await swap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    }
  })

  describe("removeLiquidityOneToken", () => {
    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      it(`Virtual price doesn't decrease after removeLiquidityOneToken at index ${i}`, async () => {
        const virtualPriceBefore = await swap.getVirtualPrice()
        await swap
          .connect(signers[1])
          .removeLiquidityOneToken(
            BigNumber.from(10).pow(18),
            i,
            0,
            MAX_UINT256,
          )
        expect(await swap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    }
  })

  describe("swap", () => {
    const swapAmount = 1

    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      for (let j = 0; j < TOKEN_HOLDERS.length; j++) {
        if (i === j) continue
        it(`Virtual price doesn't decrease after swap (${i} -> ${j})`, async () => {
          const virtualPriceBefore = await swap.getVirtualPrice()
          await swap
            .connect(signers[1])
            .swap(
              i,
              j,
              BigNumber.from(10).pow(pooledTokenDecimals[i]).mul(swapAmount),
              0,
              MAX_UINT256,
            )
          expect(await swap.getVirtualPrice()).to.gte(virtualPriceBefore)
        })
      }
    }
  })
})
