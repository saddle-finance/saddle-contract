import chai from "chai"
import { BigNumber, ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import { GenericERC20, LPToken, SwapFlashLoan } from "../build/typechain/"
import { asyncForEach, MAX_UINT256 } from "./testUtils"

const { expect } = chai
const { get } = deployments

describe("LPToken", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let firstToken: LPToken
  let lpTokenFactory: ContractFactory

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["USDPool"]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      lpTokenFactory = await ethers.getContractFactory("LPToken")
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  it("Reverts when minting 0", async () => {
    // Deploy dummy tokens
    firstToken = (await lpTokenFactory.deploy()) as LPToken
    firstToken.initialize("Test Token", "TEST")
    await expect(
      firstToken.mint(await owner.getAddress(), 0),
    ).to.be.revertedWith("LPToken: cannot mint 0")
  })

  it("Reverts when transferring the token to itself", async () => {
    const swap = (await ethers.getContractAt(
      "SwapFlashLoan",
      (
        await get("SaddleUSDPool")
      ).address,
    )) as SwapFlashLoan
    const lpToken = (await ethers.getContractAt(
      "LPToken",
      (
        await get("SaddleUSDPoolLPToken")
      ).address,
    )) as LPToken

    const ownerAddress = await owner.getAddress()

    await asyncForEach(["DAI", "USDC", "USDT"], async (tokenName) => {
      const token = (await ethers.getContractAt(
        "GenericERC20",
        (
          await get(tokenName)
        ).address,
      )) as GenericERC20
      await token.mint(
        ownerAddress,
        BigNumber.from(10)
          .pow(await token.decimals())
          .mul(1000),
      )
      await token.approve(swap.address, MAX_UINT256)
    })

    await swap.addLiquidity(
      [String(100e18), String(100e6), String(100e6)],
      0,
      MAX_UINT256,
    )

    // Verify current balance
    expect(await lpToken.balanceOf(ownerAddress)).to.eq(String(300e18))

    // Transferring LPToken to itself should revert
    await expect(
      lpToken.transfer(lpToken.address, String(100e18)),
    ).to.be.revertedWith("LPToken: cannot send to itself")
  })
})
