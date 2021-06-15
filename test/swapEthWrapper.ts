import { BigNumber, Signer } from "ethers"
import { MAX_UINT256, getUserTokenBalances } from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"
import { deployments, ethers } from "hardhat"

import { GenericERC20 } from "../build/typechain/GenericERC20"
import { LPToken } from "../build/typechain/LPToken"
import { Swap } from "../build/typechain/Swap"
import { SwapEthWrapper } from "../build/typechain/SwapEthWrapper"
import chai from "chai"

chai.use(solidity)
const { expect } = chai

let owner: Signer
let ownerAddress: string
let alEthPool: Swap
let alEthPoolWrapper: SwapEthWrapper
let lpToken: LPToken
let weth: GenericERC20
let aleth: GenericERC20
let seth: GenericERC20

describe("Meta-Swap Deposit Contract", async () => {
  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      const { get } = deployments
      await deployments.fixture() // ensure you start from a fresh deployments

      const signers = await ethers.getSigners()
      owner = signers[0]
      ownerAddress = await owner.getAddress()

      const alEthPoolDeployment = await get("SaddleALETHPool")
      alEthPool = (await ethers.getContractAt(
        alEthPoolDeployment.abi,
        alEthPoolDeployment.address,
      )) as Swap

      const alEthPoolWrapperDeployment = await get("SaddleALETHPoolWrapper")
      alEthPoolWrapper = (await ethers.getContractAt(
        alEthPoolWrapperDeployment.abi,
        alEthPoolWrapperDeployment.address,
      )) as SwapEthWrapper

      const lpTokenDeployment = await get("SaddleALETHPoolLPToken")
      lpToken = (await ethers.getContractAt(
        lpTokenDeployment.abi,
        lpTokenDeployment.address,
      )) as LPToken

      const wethDeployment = await get("WETH")
      weth = (await ethers.getContractAt(
        wethDeployment.abi,
        wethDeployment.address,
      )) as GenericERC20

      const alethDeployment = await get("ALETH")
      aleth = (await ethers.getContractAt(
        alethDeployment.abi,
        alethDeployment.address,
      )) as GenericERC20

      const sethDeployment = await get("SETH")
      seth = (await ethers.getContractAt(
        sethDeployment.abi,
        sethDeployment.address,
      )) as GenericERC20

      await weth.approve(alEthPoolWrapper.address, MAX_UINT256)
      await aleth.approve(alEthPoolWrapper.address, MAX_UINT256)
      await seth.approve(alEthPoolWrapper.address, MAX_UINT256)
      await lpToken.approve(alEthPoolWrapper.address, MAX_UINT256)

      await alEthPoolWrapper.addLiquidity(
        [String(10e18), String(10e18), String(10e18)],
        0,
        MAX_UINT256,
        { value: String(10e18) },
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("addLiquidity", () => {
    it("Succeeds with ETH", async () => {
      await alEthPoolWrapper.addLiquidity(
        [String(1e18), String(1e18), String(1e18)],
        0,
        MAX_UINT256,
        { value: String(1e18) },
      )
      expect(await lpToken.balanceOf(ownerAddress)).to.eq(String(33e18))
    })

    it("Reverts when msg.value is incorrect", async () => {
      await expect(
        alEthPoolWrapper.addLiquidity(
          [String(1e18), String(1e18), String(1e18)],
          0,
          MAX_UINT256,
          { value: String(0) },
        ),
      ).to.be.revertedWith("INCORRECT_MSG_VALUE")
    })
  })

  describe("removeLiquidity", () => {
    it("Successfully receives ETH isntead", async () => {
      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      await alEthPoolWrapper.removeLiquidity(
        String(3e18),
        [0, 0, 0],
        MAX_UINT256,
        { gasPrice: 0 },
      )
      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(String(1e18))
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(
        String(1e18),
      )
      expect(tokenBalancesAfter[1].sub(tokenBalancesBefore[1])).to.eq(
        String(1e18),
      )
    })
  })

  describe("removeLiquidityOneToken", () => {
    it("Successfully receives ETH isntead", async () => {
      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      await alEthPoolWrapper.removeLiquidityOneToken(
        String(1e18),
        0,
        0,
        MAX_UINT256,
        { gasPrice: 0 },
      )
      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq("999220599606283425")
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(String(0))
      expect(tokenBalancesAfter[1].sub(tokenBalancesBefore[1])).to.eq(String(0))
    })

    it("Successfully receives ERC20 token", async () => {
      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      await alEthPoolWrapper.removeLiquidityOneToken(
        String(1e18),
        1,
        0,
        MAX_UINT256,
        { gasPrice: 0 },
      )
      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(0)
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(
        "999220599606283425",
      )
      expect(tokenBalancesAfter[1].sub(tokenBalancesBefore[1])).to.eq(String(0))
    })
  })

  describe("removeLiquidityImbalance", () => {
    it("Successfully receives ETH isntead", async () => {
      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      await alEthPoolWrapper.removeLiquidityImbalance(
        [String(1e18), String(2e18), String(3e18)],
        String(30e18),
        MAX_UINT256,
        { gasPrice: 0 },
      )
      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(String(1e18))
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(
        String(2e18),
      )
      expect(tokenBalancesAfter[1].sub(tokenBalancesBefore[1])).to.eq(
        String(3e18),
      )
      // expected value is around 30e18 - 6e18
      expect(await lpToken.balanceOf(ownerAddress)).to.eq(
        "23997618852139140487",
      )
    })

    it("Successfully receives other ERC20 tokens", async () => {
      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      await alEthPoolWrapper.removeLiquidityImbalance(
        [0, String(2e18), String(3e18)],
        String(30e18),
        MAX_UINT256,
        { gasPrice: 0 },
      )
      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(0)
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(
        String(2e18),
      )
      expect(tokenBalancesAfter[1].sub(tokenBalancesBefore[1])).to.eq(
        String(3e18),
      )
      // expected value is around 30e18 - 5e18
      expect(await lpToken.balanceOf(ownerAddress)).to.eq(
        "24994940877001255105",
      )
    })
  })

  describe("swap", () => {
    it("Successfully swaps from ETH instead", async () => {
      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      await alEthPoolWrapper.swap(0, 1, String(1e18), 0, MAX_UINT256, {
        gasPrice: 0,
        value: String(1e18),
      })
      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      expect(ethBalanceBefore.sub(ethBalanceAfter)).to.eq(String(1e18))
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(
        "997948066410667598",
      )
      expect(tokenBalancesAfter[1].sub(tokenBalancesBefore[1])).to.eq(String(0))
    })

    it("Successfully swaps to ETH instead", async () => {
      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      await alEthPoolWrapper.swap(2, 0, String(1e18), 0, MAX_UINT256, {
        gasPrice: 0,
        value: 0,
      })
      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        aleth,
        seth,
      ])
      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq("997948066410667598")
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(String(0))
      expect(tokenBalancesBefore[1].sub(tokenBalancesAfter[1])).to.eq(
        String(1e18),
      )
    })
  })

  describe("rescue", () => {
    it("Successfully rescues tokens that may be stuck", async () => {
      await owner.sendTransaction({
        to: alEthPoolWrapper.address,
        value: BigNumber.from(String(1e18)),
      })

      await weth.transfer(alEthPoolWrapper.address, String(1e18))
      await aleth.transfer(alEthPoolWrapper.address, String(1e18))
      await seth.transfer(alEthPoolWrapper.address, String(1e18))
      await lpToken.transfer(alEthPoolWrapper.address, String(1e18))

      const ethBalanceBefore = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesBefore = await getUserTokenBalances(ownerAddress, [
        weth,
        aleth,
        seth,
        lpToken,
      ])

      await alEthPoolWrapper.rescue({ gasPrice: 0 })

      const ethBalanceAfter = await ethers.provider.getBalance(ownerAddress)
      const tokenBalancesAfter = await getUserTokenBalances(ownerAddress, [
        weth,
        aleth,
        seth,
        lpToken,
      ])

      expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(String(1e18))
      expect(tokenBalancesAfter[0].sub(tokenBalancesBefore[0])).to.eq(
        String(1e18),
      )
      expect(tokenBalancesAfter[1].sub(tokenBalancesBefore[1])).to.eq(
        String(1e18),
      )
      expect(tokenBalancesAfter[2].sub(tokenBalancesBefore[2])).to.eq(
        String(1e18),
      )
      expect(tokenBalancesAfter[3].sub(tokenBalancesBefore[3])).to.eq(
        String(1e18),
      )
    })
  })
})
