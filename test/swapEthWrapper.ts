import { BigNumber, Signer, Wallet } from "ethers"
import {
  MAX_UINT256,
  asyncForEach,
  deployContractWithLibraries,
  getCurrentBlockTimestamp,
  getUserTokenBalance,
  getUserTokenBalances,
} from "./testUtils"
import { deployContract, solidity } from "ethereum-waffle"
import { deployments, ethers } from "hardhat"

import { GenericERC20 } from "../build/typechain/GenericERC20"
import GenericERC20Artifact from "../build/artifacts/contracts/helper/GenericERC20.sol/GenericERC20.json"
import { LPToken } from "../build/typechain/LPToken"
import LPTokenArtifact from "../build/artifacts/contracts/LPToken.sol/LPToken.json"
import { Swap } from "../build/typechain/Swap"
import { SwapEthWrapper } from "../build/typechain/SwapEthWrapper"
import SwapArtifact from "../build/artifacts/contracts/Swap.sol/Swap.json"
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
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("addLiquidity", () => {
    it("Succeeds with ETH", async () => {
      await alEthPoolWrapper.addLiquidity(
        [0, String(1e18), String(1e18)],
        0,
        MAX_UINT256,
        { value: String(1e18) },
      )
      expect(await lpToken.balanceOf(ownerAddress)).to.eq(String(3e18))
    })

    it("Succeeds with WETH", async () => {
      await alEthPoolWrapper.addLiquidity(
        [String(1e18), String(1e18), String(1e18)],
        0,
        MAX_UINT256,
        { value: 0 },
      )
      expect(await lpToken.balanceOf(ownerAddress)).to.eq(String(3e18))
    })
  })

  describe("addLiquidity", () => {
    it("Succeeds with ETH", async () => {
      await alEthPoolWrapper.addLiquidity(
        [0, String(1e18), String(1e18)],
        0,
        MAX_UINT256,
        { value: String(1e18) },
      )
      expect(await lpToken.balanceOf(ownerAddress)).to.eq(String(3e18))
    })

    it("Succeeds with WETH", async () => {
      await alEthPoolWrapper.addLiquidity(
        [String(1e18), String(1e18), String(1e18)],
        0,
        MAX_UINT256,
        { value: 0 },
      )
      expect(await lpToken.balanceOf(ownerAddress)).to.eq(String(3e18))
    })
  })
})
