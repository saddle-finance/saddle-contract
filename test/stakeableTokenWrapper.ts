import { waffle, ethers } from "@nomiclabs/buidler"
import { Wallet, Signer } from "ethers";
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"
import { utils } from "ethers"

import StakeableTokenWrapperArtifact from "../build/artifacts/StakeableTokenWrapper.json"
import { StakeableTokenWrapper } from "../build/typechain/StakeableTokenWrapper"

import LPTokenArtifact from "../build/artifacts/LPToken.json"
import { LpToken } from "../build/typechain/LpToken"
import { Ierc20 as IERC20 } from "../build/typechain/Ierc20"

chai.use(solidity)
const { expect } = chai

describe("StakeableTokenWrapper", () => {
  const provider = waffle.provider
  let signers: Array<Signer>

  let basicToken: LpToken
  let tokenWrapper: StakeableTokenWrapper

  async function deployWrapper(
    token: IERC20,
  ) {
    const contract = (await deployContract(
      <Wallet>signers[0],
      StakeableTokenWrapperArtifact,
      [token.address],
    )) as StakeableTokenWrapper
    return contract
  }

  async function approveAndStake(
    wallet: any,
    amount: number
  ) {
    const wrapperAsStaker = tokenWrapper.connect(wallet)
    const tokenAsStaker = basicToken.connect(wallet)

    await tokenAsStaker.approve(wrapperAsStaker.address, amount)
    await wrapperAsStaker.stake(amount)

    return [ wrapperAsStaker, tokenAsStaker ]
  }

  beforeEach(async () => {
    signers = await ethers.getSigners()
    basicToken = (await deployContract(
      <Wallet>signers[0],
      LPTokenArtifact,
      ['Basic Token', 'BASIC'],
    )) as LpToken

    await basicToken.mint(await signers[0].getAddress(), 10 ** 10)

    await basicToken.transfer(await signers[1].getAddress(), 1000)
    await basicToken.transfer(await signers[2].getAddress(), 10000)

    tokenWrapper = (await deployWrapper(
      basicToken,
    )) as StakeableTokenWrapper
  })

  it("Emits an event on staking", async () => {
    let wrapperAsStaker1 = tokenWrapper.connect(<Wallet>signers[1])
    let tokenAsStaker1 = basicToken.connect(<Wallet>signers[1])

    await tokenAsStaker1.approve(wrapperAsStaker1.address, 1000)
    await expect(
      wrapperAsStaker1.stake(1000),
    ).to.emit(tokenWrapper, 'Staked')
  })

  it("Emits an event on withdrawing", async () => {
    const [ wrapperContract, tokenContract ] = await approveAndStake(<Wallet>signers[1], 1000)

    await expect(
      wrapperContract.withdraw(1000),
    ).to.emit(tokenWrapper, 'Withdrawn')
  })

  it("Only allows staked funds to be withdrawn", async () => {
    const [ wrapperContract, tokenContract ] = await approveAndStake(<Wallet>signers[1], 1000)

    await expect(
      wrapperContract.withdraw(1001),
    ).to.be.reverted
  })

  it("Returns correct staked balances", async () => {
    await approveAndStake(<Wallet>signers[1], 1000)
    await approveAndStake(<Wallet>signers[2], 10000)

    const balance1 = await tokenWrapper.balanceOf(await signers[1].getAddress())
    const balance2 = await tokenWrapper.balanceOf(await signers[2].getAddress())

    expect(balance1).to.eq(1000)
    expect(balance2).to.eq(10000)

  })

  it("Returns correct total supply", async () => {
    await approveAndStake(<Wallet>signers[1], 1000)
    expect(await tokenWrapper.totalSupply()).to.eq(1000)
  })
})
