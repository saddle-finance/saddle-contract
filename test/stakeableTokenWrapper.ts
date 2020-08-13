import { waffle } from "@nomiclabs/buidler"
import chai from "chai"
import { deployContract, solidity } from "ethereum-waffle"
import { utils } from "ethers"

import StakeableTokenWrapperArtifact from "../artifacts/StakeableTokenWrapper.json"
import { StakeableTokenWrapper } from "../typechain/StakeableTokenWrapper"

import LPTokenArtifact from "../artifacts/LPToken.json"
import { LpToken } from "../typechain/LpToken"
import { Ierc20 as IERC20 } from "../typechain/Ierc20"

chai.use(solidity)
const { expect } = chai

describe("StakeableTokenWrapper", () => {
  const provider = waffle.provider
  const [
    deployer,
    staker1,
    staker2,
  ] = provider.getWallets()

  let basicToken: LpToken
  let tokenWrapper: StakeableTokenWrapper

  async function deployWrapper(
    token: IERC20,
  ) {
    const contract = (await deployContract(
      deployer,
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
    basicToken = (await deployContract(
      deployer,
      LPTokenArtifact,
      ['Basic Token', 'BASIC'],
    )) as LpToken

    await basicToken.mint(deployer.address, 10 ** 10)

    await basicToken.transfer(staker1.address, 1000)
    await basicToken.transfer(staker2.address, 10000)

    tokenWrapper = (await deployWrapper(
      basicToken,
    )) as StakeableTokenWrapper
  })

  it("Emits an event on staking", async () => {
    let wrapperAsStaker1 = tokenWrapper.connect(staker1)
    let tokenAsStaker1 = basicToken.connect(staker1)

    await tokenAsStaker1.approve(wrapperAsStaker1.address, 1000)
    await expect(
      wrapperAsStaker1.stake(1000),
    ).to.emit(tokenWrapper, 'Staked')
  })

  it("Emits an event on withdrawing", async () => {
    const [ wrapperContract, tokenContract ] = await approveAndStake(staker1, 1000)

    await expect(
      wrapperContract.withdraw(1000),
    ).to.emit(tokenWrapper, 'Withdrawn')
  })

  it("Only allows staked funds to be withdrawn", async () => {
    const [ wrapperContract, tokenContract ] = await approveAndStake(staker1, 1000)

    await expect(
      wrapperContract.withdraw(1001),
    ).to.be.reverted
  })

  it("Returns correct staked balances", async () => {
    await approveAndStake(staker1, 1000)
    await approveAndStake(staker2, 10000)

    const balance1 = await tokenWrapper.balanceOf(staker1.address)
    const balance2 = await tokenWrapper.balanceOf(staker2.address)

    expect(balance1).to.eq(1000)
    expect(balance2).to.eq(10000)
  })
})
