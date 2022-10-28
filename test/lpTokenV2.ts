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

const testTokenDecimals = [6, 6]
const INITIAL_A_VALUE = 50
const SWAP_FEE = 1e7
const ADMIN_FEE = 1e6
const LP_TOKEN_NAME = "Test LP Token Name"
const LP_TOKEN_SYMBOL = "TESTLP"

describe("LPTokenV2", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let usdc: GenericERC20
  let usdt: GenericERC20
  let firstToken: LPTokenV2
  let lpTokenFactory: ContractFactory
  let swapFactory: ContractFactory
  let amplificationUtilsV2Factory: ContractFactory
  let amplificationUtilsV2: AmplificationUtilsV2
  let swapUtilsV2Factory: ContractFactory
  let swapUtilsV2: SwapUtilsV2

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["USDPool"]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      lpTokenFactory = await ethers.getContractFactory("LPTokenV2")
      amplificationUtilsV2Factory = await ethers.getContractFactory(
        "AmplificationUtilsV2",
      )
      amplificationUtilsV2 =
        (await amplificationUtilsV2Factory.deploy()) as AmplificationUtilsV2
      await amplificationUtilsV2.deployed()
      console.log("amplificationUtilsV2", amplificationUtilsV2.address)
      swapUtilsV2Factory = await ethers.getContractFactory("SwapUtilsV2")
      swapUtilsV2 = (await swapUtilsV2Factory.deploy()) as SwapUtilsV2
      await swapUtilsV2.deployed()
      // swapFactory = await ethers.getContractFactory("SwapV2")
      firstToken = (await lpTokenFactory.deploy()) as LPTokenV2
      firstToken.initialize("Test Token", "TEST")
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
    console.log("usdc", usdc.address)
    usdt = await ethers.getContract("USDT")
    console.log("usdt", usdt.address)

    await swapV2.initialize(
      [usdc.address, usdt.address],
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

    await asyncForEach([usdc, usdt], async (token) => {
      await token.mint(
        ownerAddress,
        BigNumber.from(10)
          .pow(await token.decimals())
          .mul(1000),
      )
      console.log("minted")
      await token.approve(swapV2.address, MAX_UINT256)
    })
    console.log("math ahead")
    console.log((await usdc.balanceOf(ownerAddress)).toString())
    console.log((await usdt.balanceOf(ownerAddress)).toString())

    await swapV2.addLiquidity([String(10e6), String(10e6)], 0, MAX_UINT256)

    // Verify current balance
    console.log("buh")
    expect(await poolLPToken.balanceOf(ownerAddress)).to.eq(String(20e18))

    // Transferring LPTokenV2 to itself should revert
    await expect(
      poolLPToken.transfer(firstToken.address, String(100e18)),
    ).to.be.revertedWith("LPTokenV2: cannot send to itself")
  })
})
