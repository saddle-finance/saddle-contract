import { BigNumber, Signer, Wallet } from "ethers"
import {
  MAX_UINT256,
  deployContractWithLibraries,
  getUserTokenBalance,
  asyncForEach,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"

import { GenericERC20 } from "../build/typechain/GenericERC20"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import { LPToken } from "../build/typechain/LPToken"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import { MathUtils } from "../build/typechain/MathUtils"
import MathUtilsArtifact from "../build/artifacts/contracts/MathUtils.sol/MathUtils.json"
import { FlashLoanBorrowerExample } from "../build/typechain/FlashLoanBorrowerExample"
import FlashLoanBorrowerExampleArtifact from "../build/artifacts/contracts/helper/FlashLoanBorrowerExample.sol/FlashLoanBorrowerExample.json"
import { SwapFlashLoan } from "../build/typechain/SwapFlashLoan"
import SwapFlashLoanArtifact from "../build/artifacts/contracts/SwapFlashLoan.sol/SwapFlashLoan.json"
import { SwapUtils } from "../build/typechain/SwapUtils"
import SwapUtilsArtifact from "../build/artifacts/contracts/SwapUtils.sol/SwapUtils.json"
import chai from "chai"
import { deployments, ethers } from "hardhat"
import { solidityPack } from "ethers/lib/utils"

chai.use(solidity)
const { expect } = chai

describe("Swap Flashloan", () => {
  let signers: Array<Signer>
  let swapFlashLoan: SwapFlashLoan
  let mathUtils: MathUtils
  let swapUtils: SwapUtils
  let flashLoanExample: FlashLoanBorrowerExample
  let DAI: GenericERC20
  let USDC: GenericERC20
  let USDT: GenericERC20
  let SUSD: GenericERC20
  let swapToken: LPToken
  let owner: Signer
  let user1: Signer
  let user2: Signer
  let attacker: Signer
  let ownerAddress: string
  let user1Address: string
  let user2Address: string
  let swapStorage: {
    initialA: BigNumber
    futureA: BigNumber
    initialATime: BigNumber
    futureATime: BigNumber
    swapFee: BigNumber
    adminFee: BigNumber
    lpToken: string
  }

  // Test Values
  const INITIAL_A_VALUE = 50
  const SWAP_FEE = 1e7
  const LP_TOKEN_NAME = "Test LP Token Name"
  const LP_TOKEN_SYMBOL = "TESTLP"
  const TOKENS: GenericERC20[] = []

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments
      TOKENS.length = 0
      signers = await ethers.getSigners()
      owner = signers[0]
      user1 = signers[1]
      user2 = signers[2]
      attacker = signers[10]
      ownerAddress = await owner.getAddress()
      user1Address = await user1.getAddress()
      user2Address = await user2.getAddress()

      // Deploy dummy tokens
      DAI = (await deployContract(owner as Wallet, GenericERC20Artifact, [
        "DAI",
        "DAI",
        "18",
      ])) as GenericERC20

      USDC = (await deployContract(owner as Wallet, GenericERC20Artifact, [
        "USDC",
        "USDC",
        "6",
      ])) as GenericERC20

      USDT = (await deployContract(owner as Wallet, GenericERC20Artifact, [
        "USDT",
        "USDT",
        "6",
      ])) as GenericERC20

      SUSD = (await deployContract(owner as Wallet, GenericERC20Artifact, [
        "SUSD",
        "SUSD",
        "18",
      ])) as GenericERC20

      TOKENS.push(DAI, USDC, USDT, SUSD)

      // Mint dummy tokens
      await asyncForEach(
        [ownerAddress, user1Address, user2Address, await attacker.getAddress()],
        async (address) => {
          await DAI.mint(address, String(1e20))
          await USDC.mint(address, String(1e8))
          await USDT.mint(address, String(1e8))
          await SUSD.mint(address, String(1e20))
        },
      )

      // Deploy MathUtils
      mathUtils = (await deployContract(
        signers[0] as Wallet,
        MathUtilsArtifact,
      )) as MathUtils

      // Deploy SwapUtils with MathUtils library
      swapUtils = (await deployContractWithLibraries(owner, SwapUtilsArtifact, {
        MathUtils: mathUtils.address,
      })) as SwapUtils
      await swapUtils.deployed()

      // Deploy Swap with SwapUtils library
      swapFlashLoan = (await deployContractWithLibraries(
        owner,
        SwapFlashLoanArtifact,
        { SwapUtils: swapUtils.address },
      )) as SwapFlashLoan
      await swapFlashLoan.deployed()

      await swapFlashLoan.initialize(
        [DAI.address, USDC.address, USDT.address, SUSD.address],
        [18, 6, 6, 18],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        0,
        0,
      )

      expect(await swapFlashLoan.getVirtualPrice()).to.be.eq(0)

      swapStorage = await swapFlashLoan.swapStorage()

      swapToken = (await ethers.getContractAt(
        LPTokenArtifact.abi,
        swapStorage.lpToken,
      )) as LPToken

      await asyncForEach([owner, user1, user2, attacker], async (signer) => {
        await DAI.connect(signer).approve(swapFlashLoan.address, MAX_UINT256)
        await USDC.connect(signer).approve(swapFlashLoan.address, MAX_UINT256)
        await USDT.connect(signer).approve(swapFlashLoan.address, MAX_UINT256)
        await SUSD.connect(signer).approve(swapFlashLoan.address, MAX_UINT256)
      })

      // Populate the pool with initial liquidity
      await swapFlashLoan.addLiquidity(
        [String(50e18), String(50e6), String(50e6), String(50e18)],
        0,
        MAX_UINT256,
      )

      expect(await swapFlashLoan.getTokenBalance(0)).to.be.eq(String(50e18))
      expect(await swapFlashLoan.getTokenBalance(1)).to.be.eq(String(50e6))
      expect(await swapFlashLoan.getTokenBalance(2)).to.be.eq(String(50e6))
      expect(await swapFlashLoan.getTokenBalance(3)).to.be.eq(String(50e18))
      expect(await getUserTokenBalance(owner, swapToken)).to.be.eq(
        String(200e18),
      )

      // Deploy MathUtils
      flashLoanExample = (await deployContract(
        signers[0] as Wallet,
        FlashLoanBorrowerExampleArtifact,
      )) as FlashLoanBorrowerExample
      await flashLoanExample.deployed()
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  it("Reverts when the borrower does not have enough to pay back", async () => {
    await expect(
      flashLoanExample.flashLoan(swapFlashLoan.address, USDC.address, 1e6, []),
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
  })

  it("Reverts when flashloan debt is not paid", async () => {
    await expect(
      flashLoanExample.flashLoan(
        swapFlashLoan.address,
        USDC.address,
        1e6,
        solidityPack(["string"], ["dontRepayDebt"]),
      ),
    ).to.be.revertedWith("flashLoan fee is not met")
  })

  it("Reverts when calling re-entering swap contract via `addLiquidity`", async () => {
    await expect(
      flashLoanExample.flashLoan(
        swapFlashLoan.address,
        USDC.address,
        1e6,
        solidityPack(["string"], ["reentrancy_addLiquidity"]),
      ),
    ).to.be.revertedWith("ReentrancyGuard: reentrant call")
  })

  it("Reverts when calling re-entering swap contract via `swap`", async () => {
    await expect(
      flashLoanExample.flashLoan(
        swapFlashLoan.address,
        USDC.address,
        1e6,
        solidityPack(["string"], ["reentrancy_swap"]),
      ),
    ).to.be.revertedWith("ReentrancyGuard: reentrant call")
  })

  it("Reverts when calling re-entering swap contract via `removeLiquidity`", async () => {
    await expect(
      flashLoanExample.flashLoan(
        swapFlashLoan.address,
        USDC.address,
        1e6,
        solidityPack(["string"], ["reentrancy_removeLiquidity"]),
      ),
    ).to.be.revertedWith("ReentrancyGuard: reentrant call")
  })

  it("Reverts when calling re-entering swap contract via `removeLiquidityOneToken`", async () => {
    await expect(
      flashLoanExample.flashLoan(
        swapFlashLoan.address,
        USDC.address,
        1e6,
        solidityPack(["string"], ["reentrancy_removeLiquidityOneToken"]),
      ),
    ).to.be.revertedWith("ReentrancyGuard: reentrant call")
  })

  it("Succeeds when fee is paid off", async () => {
    const flashLoanAmount = BigNumber.from(1e6)
    const flashLoanFee = flashLoanAmount
      .mul(await swapFlashLoan.flashLoanFeeBPS())
      .div(10000)

    // Check the initial balance and the virtual price
    expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000000000000000000")
    expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50000000")

    // Since the contract is empty, we need to give the contract some USDC to have enough to pay off the fee
    await USDC.connect(user1).transfer(flashLoanExample.address, flashLoanFee)
    await expect(
      flashLoanExample.flashLoan(swapFlashLoan.address, USDC.address, 1e6, []),
    ).to.emit(swapFlashLoan, "FlashLoan")

    // Check the borrower contract paid off the balance
    expect(await USDC.balanceOf(flashLoanExample.address)).to.eq(0)
    expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000024999981618719")
    expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50005000")
    expect(await swapFlashLoan.getAdminBalance(1)).to.eq("5000")
  })

  describe("setFlashLoanFees", () => {
    it("Reverts when called by non-owner", async () => {
      await expect(
        swapFlashLoan.connect(user1).setFlashLoanFees(100, 5000),
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Reverts when fees are not in the range", async () => {
      await expect(swapFlashLoan.setFlashLoanFees(0, 5000)).to.be.revertedWith(
        "fees are not in valid range",
      )
      await expect(
        swapFlashLoan.setFlashLoanFees(100000, 5000),
      ).to.be.revertedWith("fees are not in valid range")
      await expect(
        swapFlashLoan.setFlashLoanFees(100, 100000),
      ).to.be.revertedWith("fees are not in valid range")
      await expect(
        swapFlashLoan.setFlashLoanFees(100000, 100000),
      ).to.be.revertedWith("fees are not in valid range")
    })

    it("Succeeds when fees are in the valid range", async () => {
      await swapFlashLoan.setFlashLoanFees(50, 100)
      expect(await swapFlashLoan.flashLoanFeeBPS()).to.eq(50)
      expect(await swapFlashLoan.protocolFeeShareBPS()).to.eq(100)

      const flashLoanAmount = BigNumber.from(1e6)
      const flashLoanFee = flashLoanAmount.mul(50).div(10000)

      // Check the initial balance and the virtual price
      expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000000000000000000")
      expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50000000")

      // Since the contract is empty, we need to give the contract some USDC to have enough to pay off the fee
      await USDC.connect(user1).transfer(flashLoanExample.address, flashLoanFee)
      await flashLoanExample.flashLoan(
        swapFlashLoan.address,
        USDC.address,
        1e6,
        [],
      )

      // Check the borrower contract paid off the balance
      expect(await USDC.balanceOf(flashLoanExample.address)).to.eq(0)
      expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000024749981984496")
      expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50004950")
      expect(await swapFlashLoan.getAdminBalance(1)).to.eq("50")
    })
  })
})
