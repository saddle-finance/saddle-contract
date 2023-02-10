import chai from "chai"
import { BigNumber, Signer } from "ethers"
import { solidityPack } from "ethers/lib/utils"
import { deployments } from "hardhat"
import {
  FlashLoanBorrowerExample,
  GenericERC20,
  GenericERC20__factory,
  LPToken,
  SwapFlashLoan,
} from "../build/typechain/"
import { asyncForEach, getUserTokenBalance, MAX_UINT256 } from "./testUtils"

const { expect } = chai

describe("Swap Flashloan", () => {
  let signers: Array<Signer>
  let swapFlashLoan: SwapFlashLoan
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
      const { get } = deployments
      await deployments.fixture(["SUSDMetaPoolTokens"]) // ensure you start from a fresh deployments

      TOKENS.length = 0
      signers = await ethers.getSigners()
      owner = signers[0]
      user1 = signers[1]
      user2 = signers[2]
      attacker = signers[10]
      ownerAddress = await owner.getAddress()
      user1Address = await user1.getAddress()
      user2Address = await user2.getAddress()

      const erc20Factory: GenericERC20__factory =
        await ethers.getContractFactory("GenericERC20")

      // Deploy dummy tokens
      DAI = await erc20Factory.deploy("DAI", "DAI", "18")
      USDC = await erc20Factory.deploy("USDC", "USDC", "6")
      USDT = await erc20Factory.deploy("USDT", "USDT", "6")
      SUSD = await erc20Factory.deploy("SUSD", "SUSD", "18")

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

      // Deploy Swap with SwapUtils library
      swapFlashLoan = await ethers.getContract("SwapFlashLoan")

      await swapFlashLoan.initialize(
        [DAI.address, USDC.address, USDT.address, SUSD.address],
        [18, 6, 6, 18],
        LP_TOKEN_NAME,
        LP_TOKEN_SYMBOL,
        INITIAL_A_VALUE,
        SWAP_FEE,
        0,
        (
          await deployments.get("LPToken")
        ).address,
      )

      expect(await swapFlashLoan.getVirtualPrice()).to.be.eq(0)

      swapStorage = await swapFlashLoan.swapStorage()

      swapToken = (await ethers.getContractAt(
        "LPToken",
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

      // Deploy an example flash loan borrower contract
      const flashLoanExampleFactory = await ethers.getContractFactory(
        "FlashLoanBorrowerExample",
      )
      flashLoanExample =
        (await flashLoanExampleFactory.deploy()) as FlashLoanBorrowerExample

      // Set fees to easier numbers for debugging
      await swapFlashLoan.setFlashLoanFees(100, 5000)
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
    expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000024999981618719")
    expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50005000")
    expect(await swapFlashLoan.getAdminBalance(1)).to.eq("5000")
    expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50010000")

    // Try to do the flashloan again.
    await USDC.connect(user1).transfer(flashLoanExample.address, flashLoanFee)
    await expect(
      flashLoanExample.flashLoan(swapFlashLoan.address, USDC.address, 1e6, []),
    ).to.emit(swapFlashLoan, "FlashLoan")

    expect(await USDC.balanceOf(flashLoanExample.address)).to.eq(0)
    expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000049999926479164")
    expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50010000")
    expect(await swapFlashLoan.getAdminBalance(1)).to.eq("10000")
    expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50020000")

    // Try to withdraw the protocol fees
    await swapFlashLoan.withdrawAdminFees()
    expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000049999926479164")
    expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50010000")
    expect(await swapFlashLoan.getAdminBalance(1)).to.eq("0")
    expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50010000")
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

    it("Succeeds when protocol fee bps is set to 0", async () => {
      // Realistic flashloan fee
      const newFlashLoanFeeBPS = 8
      const newProtocolFeeBPS = 0

      await swapFlashLoan.setFlashLoanFees(
        newFlashLoanFeeBPS,
        newProtocolFeeBPS,
      )
      expect(await swapFlashLoan.flashLoanFeeBPS()).to.eq(newFlashLoanFeeBPS)
      expect(await swapFlashLoan.protocolFeeShareBPS()).to.eq(newProtocolFeeBPS)

      const flashLoanAmount = BigNumber.from(1e6)
      const flashLoanFee = flashLoanAmount.mul(newFlashLoanFeeBPS).div(10000)

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
      expect(await swapFlashLoan.getVirtualPrice()).to.eq("1000003999999529416")
      expect(await swapFlashLoan.getTokenBalance(1)).to.eq("50000800")
      expect(await swapFlashLoan.getAdminBalance(1)).to.eq("0")
      expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50000800")
    })

    it("Succeeds when fees are in the valid range", async () => {
      const newFlashLoanFeeBPS = 50
      const newProtocolFeeBPS = 100

      await swapFlashLoan.setFlashLoanFees(
        newFlashLoanFeeBPS,
        newProtocolFeeBPS,
      )
      expect(await swapFlashLoan.flashLoanFeeBPS()).to.eq(newFlashLoanFeeBPS)
      expect(await swapFlashLoan.protocolFeeShareBPS()).to.eq(newProtocolFeeBPS)

      const flashLoanAmount = BigNumber.from(1e6)
      const flashLoanFee = flashLoanAmount.mul(newFlashLoanFeeBPS).div(10000)

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
      expect(await USDC.balanceOf(swapFlashLoan.address)).to.eq("50005000")
    })
  })
})
