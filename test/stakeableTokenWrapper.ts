import chai from "chai"
import { Signer, Wallet } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  GenericERC20,
  IERC20,
  StakeableTokenWrapper,
} from "../build/typechain/"

const { expect } = chai

describe("StakeableTokenWrapper", () => {
  let signers: Array<Signer>

  let basicToken: GenericERC20
  let tokenWrapper: StakeableTokenWrapper

  async function deployWrapper(token: IERC20): Promise<StakeableTokenWrapper> {
    const factory = await ethers.getContractFactory("StakeableTokenWrapper")
    return factory.deploy(token.address) as Promise<StakeableTokenWrapper>
  }

  async function approveAndStake(
    wallet: Wallet,
    amount: number,
  ): Promise<StakeableTokenWrapper> {
    const wrapperAsStaker = tokenWrapper.connect(wallet)
    const tokenAsStaker = basicToken.connect(wallet)

    await tokenAsStaker.approve(wrapperAsStaker.address, amount)
    await wrapperAsStaker.stake(amount)

    return wrapperAsStaker
  }

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture([]) // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      const erc20Factory = await ethers.getContractFactory("GenericERC20")
      basicToken = (await erc20Factory.deploy(
        "Basic Token",
        "BASIC",
        "18",
      )) as GenericERC20

      await basicToken.mint(await signers[0].getAddress(), 10 ** 10)

      await basicToken.transfer(await signers[1].getAddress(), 1000)
      await basicToken.transfer(await signers[2].getAddress(), 10000)

      tokenWrapper = (await deployWrapper(
        basicToken as unknown as IERC20,
      )) as StakeableTokenWrapper
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  it("Reverts when staking 0", async () => {
    const wrapperAsStaker1 = tokenWrapper.connect(signers[1] as Wallet)
    const tokenAsStaker1 = basicToken.connect(signers[1] as Wallet)

    await tokenAsStaker1.approve(wrapperAsStaker1.address, 1000)
    await expect(wrapperAsStaker1.stake(0)).to.be.reverted
  })

  it("Emits an event on staking", async () => {
    const wrapperAsStaker1 = tokenWrapper.connect(signers[1] as Wallet)
    const tokenAsStaker1 = basicToken.connect(signers[1] as Wallet)

    await tokenAsStaker1.approve(wrapperAsStaker1.address, 1000)
    await expect(wrapperAsStaker1.stake(1000)).to.emit(tokenWrapper, "Staked")
  })

  it("Emits an event on withdrawing", async () => {
    const wrapperContract = await approveAndStake(signers[1] as Wallet, 1000)

    await expect(wrapperContract.withdraw(1000)).to.emit(
      tokenWrapper,
      "Withdrawn",
    )
  })

  it("Only allows staked funds to be withdrawn", async () => {
    const wrapperContract = await approveAndStake(signers[1] as Wallet, 1000)

    await expect(wrapperContract.withdraw(1001)).to.be.reverted
  })

  it("Returns correct staked balances", async () => {
    await approveAndStake(signers[1] as Wallet, 1000)
    await approveAndStake(signers[2] as Wallet, 10000)

    const balance1 = await tokenWrapper.balanceOf(await signers[1].getAddress())
    const balance2 = await tokenWrapper.balanceOf(await signers[2].getAddress())

    expect(balance1).to.eq(1000)
    expect(balance2).to.eq(10000)
  })

  it("Returns correct total supply", async () => {
    await approveAndStake(signers[1] as Wallet, 1000)
    expect(await tokenWrapper.totalSupply()).to.eq(1000)
  })
})
