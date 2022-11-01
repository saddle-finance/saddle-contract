import chai from "chai"
import { BigNumber, ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import SwapV2Artifact from "../build/artifacts/contracts/SwapV2.sol/SwapV2.json"
import {
  AmplificationUtilsV2,
  GenericERC20,
  LPTokenV2,
  SwapUtilsV2,
  SwapV2,
} from "../build/typechain"
import {
  asyncForEach,
  deployContractWithLibraries,
  MAX_UINT256,
} from "./testUtils"

const { expect } = chai
const { get } = deployments

const testTokenDecimals = [18, 6, 6]
const INITIAL_A_VALUE = 200
const SWAP_FEE = 4e6
const ADMIN_FEE = 0
const LP_TOKEN_NAME = "Test LP Token Name"
const LP_TOKEN_SYMBOL = "TESTLP"

describe("LPTokenV2", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let usdc: GenericERC20
  let usdt: GenericERC20
  let dai: GenericERC20
  let firstToken: LPTokenV2
  let lpTokenFactory: ContractFactory
  let swapFactory: ContractFactory
  let amplificationUtilsV2Factory: ContractFactory
  let amplificationUtilsV2: AmplificationUtilsV2
  let swapUtilsV2Factory: ContractFactory
  let swapUtilsV2: SwapUtilsV2
  let swap: SwapV2

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["USDPool"]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      // Deploy LP Token
      lpTokenFactory = await ethers.getContractFactory("LPTokenV2")
      firstToken = (await lpTokenFactory.deploy()) as LPTokenV2
      firstToken.initialize("Test Token", "TEST")
      // Deploy Amplification Utils
      amplificationUtilsV2Factory = await ethers.getContractFactory(
        "AmplificationUtilsV2",
      )
      amplificationUtilsV2 =
        (await amplificationUtilsV2Factory.deploy()) as AmplificationUtilsV2
      await amplificationUtilsV2.deployed()
      // Deploy Swap Utils
      swapUtilsV2Factory = await ethers.getContractFactory("SwapUtilsV2")
      swapUtilsV2 = (await swapUtilsV2Factory.deploy()) as SwapUtilsV2
      await swapUtilsV2.deployed()
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  it("Reverts when minting 0", async () => {
    // Deploy dummy tokens
    await expect(
      firstToken.mint(await owner.getAddress(), 0),
    ).to.be.revertedWith("LPToken: cannot mint 0")
  })

  it("Reverts when transferring the token to itself", async () => {
    const swapV2 = (await deployContractWithLibraries(owner, SwapV2Artifact, {
      SwapUtilsV2: swapUtilsV2.address,
      AmplificationUtilsV2: amplificationUtilsV2.address,
    })) as SwapV2
    await swapV2.deployed()

    usdc = await ethers.getContract("USDC")
    usdt = await ethers.getContract("USDT")
    dai = await ethers.getContract("DAI")

    await swapV2.initialize(
      [dai.address, usdc.address, usdt.address],
      testTokenDecimals,
      LP_TOKEN_NAME,
      LP_TOKEN_SYMBOL,
      INITIAL_A_VALUE,
      SWAP_FEE,
      ADMIN_FEE,
      firstToken.address,
    )

    const poolLPTokenAddress = await (await swapV2.swapStorage()).lpToken
    const poolLPToken = (await ethers.getContractAt(
      "LPTokenV2",
      poolLPTokenAddress,
    )) as LPTokenV2
    const ownerAddress = await owner.getAddress()

    await asyncForEach([dai, usdc, usdt], async (token) => {
      await token.mint(
        ownerAddress,
        BigNumber.from(10)
          .pow(await token.decimals())
          .mul(1000),
      )
      await token.approve(swapV2.address, MAX_UINT256)
    })

    await swapV2.addLiquidity(
      [String(10e18), String(10e6), String(10e6)],
      0,
      MAX_UINT256,
    )
    // Verify current balance
    expect(await poolLPToken.balanceOf(ownerAddress)).to.eq(String(30e18))

    // Transferring LPTokenV2 to itself should revert
    await expect(
      poolLPToken.transfer(poolLPToken.address, String(100e18)),
    ).to.be.revertedWith("LPToken: cannot send to itself")
  })
})
