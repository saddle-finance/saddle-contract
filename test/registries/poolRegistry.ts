/* eslint-disable prettier/prettier */
/*eslint max-len: ["error", { "code": 150 }]*/

import chai from "chai"
import { solidity } from "ethereum-waffle"
import { BigNumber, ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  IPoolRegistry,
  ISwapGuarded,
  MetaSwap,
  PoolRegistry,
  Swap,
} from "../../build/typechain"
import { PoolType } from "../../utils/constants"
import {
  BIG_NUMBER_1E18,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setTimestamp,
  ZERO_ADDRESS,
} from "../testUtils"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

const POOL_REGISTRY_CONTRACT_NAME = "PoolRegistry"
const USD_POOL_CONTRACT_NAME = "SaddleUSDPoolV2"
const USD_V2_LP_TOKEN_CONTRACT_NAME = "SaddleUSDPoolV2LPToken"
const DAI_CONTRACT_NAME = "DAI"
const USDC_CONTRACT_NAME = "USDC"
const USDT_CONTRACT_NAME = "USDT"
const SUSD_CONTRACT_NAME = "SUSD"
const RENBTC_CONTRACT_NAME = "RENBTC"
const WBTC_CONTRACT_NAME = "WBTC"
const TBTC_CONTRACT_NAME = "TBTC"
const SBTC_CONTRACT_NAME = "SBTC"

const GENERIC_ERC20_CONTRACT_NAME = "GenericERC20"
const SUSD_META_POOL_CONTRACT_NAME = "SaddleSUSDMetaPoolUpdated"
const SUSD_META_POOL_DEPOSIT_CONTRACT_NAME = "SaddleSUSDMetaPoolUpdatedDeposit"
const SUSD_META_POOL_LP_TOKEN_CONTRACT_NAME = "SaddleSUSDMetaPoolUpdatedLPToken"
const BTC_POOL_CONTRACT_NAME = "SaddleBTCPool"
const BTC_POOL_LP_TOKEN_NAME = "SaddleBTCPoolLPToken"

const BYTES32_USDV2_POOL_NAME = ethers.utils.formatBytes32String("USDv2")
const BYTES32_SUSD_META_POOL_NAME =
  ethers.utils.formatBytes32String("sUSD meta v2")
const BYTES32_BTC_POOL_NAME = ethers.utils.formatBytes32String("BTC_guarded")

describe("Registry", async () => {
  let signers: Array<Signer>
  let owner: Signer
  let ownerAddress: string
  let poolRegistry: PoolRegistry
  let registryFactory: ContractFactory
  let usdv2Data: IPoolRegistry.PoolDataStructOutput
  let susdMetaV2Data: IPoolRegistry.PoolDataStructOutput
  let guardedBtcData: IPoolRegistry.PoolDataStructOutput
  let usdv2InputData: IPoolRegistry.PoolInputDataStructOutput
  let susdMetaV2InputData: IPoolRegistry.PoolInputDataStructOutput
  let guardedBtcInputData: IPoolRegistry.PoolInputDataStructOutput

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      owner = signers[0]
      ownerAddress = await owner.getAddress()
      registryFactory = await ethers.getContractFactory(
        POOL_REGISTRY_CONTRACT_NAME,
      )
      poolRegistry = (await registryFactory.deploy(
        ownerAddress,
        ownerAddress,
      )) as PoolRegistry

      usdv2InputData = {
        poolAddress: (await get(USD_POOL_CONTRACT_NAME)).address,
        typeOfAsset: PoolType.USD,
        poolName: BYTES32_USDV2_POOL_NAME,
        targetAddress: (await get(USD_POOL_CONTRACT_NAME)).address,
        metaSwapDepositAddress: ZERO_ADDRESS,
        isSaddleApproved: true,
        isRemoved: false,
        isGuarded: false,
      } as IPoolRegistry.PoolInputDataStructOutput

      usdv2Data = {
        poolAddress: (await get(USD_POOL_CONTRACT_NAME)).address,
        lpToken: (await get(USD_V2_LP_TOKEN_CONTRACT_NAME)).address,
        typeOfAsset: PoolType.USD,
        poolName: BYTES32_USDV2_POOL_NAME,
        targetAddress: (await get(USD_POOL_CONTRACT_NAME)).address,
        tokens: [
          (await get(DAI_CONTRACT_NAME)).address,
          (await get(USDC_CONTRACT_NAME)).address,
          (await get(USDT_CONTRACT_NAME)).address,
        ],
        underlyingTokens: [] as string[],
        basePoolAddress: ZERO_ADDRESS,
        metaSwapDepositAddress: ZERO_ADDRESS,
        isSaddleApproved: true,
        isRemoved: false,
        isGuarded: false,
      } as IPoolRegistry.PoolDataStructOutput

      susdMetaV2InputData = {
        poolAddress: (await get(SUSD_META_POOL_CONTRACT_NAME)).address,
        typeOfAsset: PoolType.USD,
        poolName: BYTES32_SUSD_META_POOL_NAME,
        targetAddress: (await get(SUSD_META_POOL_CONTRACT_NAME)).address,
        metaSwapDepositAddress: (
          await get(SUSD_META_POOL_DEPOSIT_CONTRACT_NAME)
        ).address,
        isSaddleApproved: true,
        isRemoved: false,
        isGuarded: false,
      } as IPoolRegistry.PoolInputDataStructOutput

      susdMetaV2Data = {
        poolAddress: (await get(SUSD_META_POOL_CONTRACT_NAME)).address,
        lpToken: (await get(SUSD_META_POOL_LP_TOKEN_CONTRACT_NAME)).address,
        typeOfAsset: PoolType.USD,
        poolName: BYTES32_SUSD_META_POOL_NAME,
        targetAddress: (await get(SUSD_META_POOL_CONTRACT_NAME)).address,
        tokens: [
          (await get(SUSD_CONTRACT_NAME)).address,
          (await get(USD_V2_LP_TOKEN_CONTRACT_NAME)).address,
        ],
        underlyingTokens: [
          (await get(SUSD_CONTRACT_NAME)).address,
          (await get(DAI_CONTRACT_NAME)).address,
          (await get(USDC_CONTRACT_NAME)).address,
          (await get(USDT_CONTRACT_NAME)).address,
        ],
        basePoolAddress: (await get(USD_POOL_CONTRACT_NAME)).address,
        metaSwapDepositAddress: (
          await get(SUSD_META_POOL_DEPOSIT_CONTRACT_NAME)
        ).address,
        isSaddleApproved: true,
        isRemoved: false,
        isGuarded: false,
      } as IPoolRegistry.PoolDataStructOutput

      guardedBtcInputData = {
        poolAddress: (await get(BTC_POOL_CONTRACT_NAME)).address,
        typeOfAsset: PoolType.BTC,
        poolName: BYTES32_BTC_POOL_NAME,
        targetAddress: (await get(BTC_POOL_CONTRACT_NAME)).address,
        metaSwapDepositAddress: ZERO_ADDRESS,
        isSaddleApproved: true,
        isRemoved: false,
        isGuarded: true,
      } as IPoolRegistry.PoolInputDataStructOutput

      guardedBtcData = {
        poolAddress: (await get(BTC_POOL_CONTRACT_NAME)).address,
        lpToken: (await get(BTC_POOL_LP_TOKEN_NAME)).address,
        typeOfAsset: PoolType.BTC,
        poolName: BYTES32_BTC_POOL_NAME,
        targetAddress: (await get(BTC_POOL_CONTRACT_NAME)).address,
        tokens: [
          (await get(TBTC_CONTRACT_NAME)).address,
          (await get(WBTC_CONTRACT_NAME)).address,
          (await get(RENBTC_CONTRACT_NAME)).address,
          (await get(SBTC_CONTRACT_NAME)).address,
        ],
        underlyingTokens: [] as string[],
        basePoolAddress: ZERO_ADDRESS,
        metaSwapDepositAddress: ZERO_ADDRESS,
        isSaddleApproved: true,
        isRemoved: false,
        isGuarded: true,
      } as IPoolRegistry.PoolDataStructOutput

      for (const token of usdv2Data.tokens) {
        const tokenContract = await ethers.getContractAt(
          GENERIC_ERC20_CONTRACT_NAME,
          token,
        )
        await tokenContract.approve(usdv2Data.poolAddress, MAX_UINT256)
      }
      const usdPoolContract = (await ethers.getContract(
        USD_POOL_CONTRACT_NAME,
      )) as Swap
      await usdPoolContract.addLiquidity(
        [String(1e18), String(1e6), String(1e6)],
        0,
        MAX_UINT256,
      )

      await setTimestamp((await getCurrentBlockTimestamp()) + 600)

      for (const token of susdMetaV2Data.tokens) {
        const tokenContract = await ethers.getContractAt(
          GENERIC_ERC20_CONTRACT_NAME,
          token,
        )
        await tokenContract.approve(susdMetaV2Data.poolAddress, MAX_UINT256)
      }
      const susdPoolContract = (await ethers.getContract(
        SUSD_META_POOL_CONTRACT_NAME,
      )) as MetaSwap
      await susdPoolContract.addLiquidity(
        [String(1e18), String(1e18)],
        0,
        MAX_UINT256,
      )
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("addPool", () => {
    it("Successfully adds USDv2 pool", async () => {
      await poolRegistry.addPool(usdv2InputData)
    })
    it("Reverts adding USDv2 pool with incorrect pool address", async () => {
      const incorrectData = {
        ...usdv2InputData,
        poolAddress: ZERO_ADDRESS,
      }
      await expect(poolRegistry.addPool(incorrectData)).to.be.revertedWith(
        "PR: poolAddress is 0",
      )
    })
    it("Reverts when adding a meta pool without adding the base pool", async () => {
      await expect(
        poolRegistry.addPool(susdMetaV2InputData),
      ).to.be.revertedWith("base pool not found")
    })
  })

  describe("getPoolsLength", () => {
    it("Successfully returns length of the private variable pools", async () => {
      expect(await poolRegistry.getPoolsLength()).to.eq(0)
      await poolRegistry.addPool(usdv2InputData)
      expect(await poolRegistry.getPoolsLength()).to.eq(1)
      await poolRegistry.addPool(susdMetaV2InputData)
      expect(await poolRegistry.getPoolsLength()).to.eq(2)
    })
  })

  describe("getPoolData & getPoolDataAtIndex", () => {
    it("Successfully reads getPoolData", async () => {
      await poolRegistry.addPool(usdv2Data)
      await poolRegistry.addPool(susdMetaV2Data)
      let fetchedByAddress = await poolRegistry.getPoolData(
        (
          await get(USD_POOL_CONTRACT_NAME)
        ).address,
      )
      let fetchedByIndex = await poolRegistry.getPoolDataAtIndex(0)
      expect(fetchedByAddress).to.eql(Object.values(usdv2Data))
      expect(fetchedByIndex).to.eql(Object.values(usdv2Data))

      fetchedByAddress = await poolRegistry.callStatic.getPoolData(
        (
          await get(SUSD_META_POOL_CONTRACT_NAME)
        ).address,
      )
      fetchedByIndex = await poolRegistry.callStatic.getPoolDataAtIndex(1)
      expect(fetchedByAddress).to.eql(Object.values(susdMetaV2Data))
      expect(fetchedByIndex).to.eql(Object.values(susdMetaV2Data))
    })

    it("Successfully reads getPoolData of guarded pools", async () => {
      await poolRegistry.addPool(guardedBtcInputData)
      const fetchedByAddress = await poolRegistry.getPoolData(
        (
          await get(BTC_POOL_CONTRACT_NAME)
        ).address,
      )
      const fetchedByIndex = await poolRegistry.getPoolDataAtIndex(0)
      expect(fetchedByAddress).to.eql(Object.values(guardedBtcData))
      expect(fetchedByIndex).to.eql(Object.values(guardedBtcData))
    })

    it("Reverts when out of range", async () => {
      await expect(poolRegistry.getPoolDataAtIndex(0)).to.be.revertedWith(
        "PR: Index out of bounds",
      )
    })

    it("Reverts when address not found", async () => {
      await expect(poolRegistry.getPoolData(ZERO_ADDRESS)).to.be.revertedWith(
        "PR: No matching pool found",
      )
    })
  })

  describe("getVirtualPrice", () => {
    it("Successfully fetches virtual price for given pool address", async () => {
      await poolRegistry.addPool(usdv2Data)
      expect(
        await poolRegistry.callStatic.getVirtualPrice(usdv2Data.poolAddress),
      ).to.eq(BIG_NUMBER_1E18)
    })
  })

  describe("getA", () => {
    it("Successfully fetches A for given pool address", async () => {
      await poolRegistry.addPool(usdv2Data)
      expect(await poolRegistry.callStatic.getA(usdv2Data.poolAddress)).to.eq(
        200,
      )
    })
  })

  describe("getTokens", () => {
    it("Successfully fetches tokens for given pool address", async () => {
      await poolRegistry.addPool(usdv2Data)
      expect(
        await poolRegistry.callStatic.getTokens(usdv2Data.poolAddress),
      ).to.eql(usdv2Data.tokens)
    })
  })

  describe("getUnderlyingTokens", () => {
    it("Successfully returns correct array of underlying tokens", async () => {
      await poolRegistry.addPool(usdv2InputData)
      const underlyingTokens = await poolRegistry.getUnderlyingTokens(
        usdv2Data.poolAddress,
      )
      expect(underlyingTokens).to.deep.equal(usdv2Data.underlyingTokens)

      await poolRegistry.addPool(susdMetaV2InputData)
      const underlyingTokensMeta = await poolRegistry.getUnderlyingTokens(
        susdMetaV2Data.poolAddress,
      )
      expect(underlyingTokensMeta).to.deep.equal(
        susdMetaV2Data.underlyingTokens,
      )
    })
  })

  describe("getUnderlyingTokenBalances", () => {
    it("Successfully returns correct array of underlying tokens", async () => {
      await poolRegistry.addPool(usdv2InputData)
      const basePoolBalances = await poolRegistry.getTokenBalances(
        usdv2Data.poolAddress,
      )
      expect(basePoolBalances).to.deep.equal([
        BIG_NUMBER_1E18,
        BigNumber.from(1e6),
        BigNumber.from(1e6),
      ])

      await poolRegistry.addPool(susdMetaV2InputData)
      const underlyingBalances = await poolRegistry.getUnderlyingTokenBalances(
        susdMetaV2Data.poolAddress,
      )
      expect(underlyingBalances).to.deep.equal([
        BIG_NUMBER_1E18,
        BigNumber.from("333333333333333333"),
        BigNumber.from("333333"),
        BigNumber.from("333333"),
      ])
    })
  })

  describe("getBalances", () => {
    it("Successfully fetches balances for given pool address", async () => {
      await poolRegistry.addPool(usdv2Data)
      expect(
        await poolRegistry.callStatic.getTokenBalances(usdv2Data.poolAddress),
      ).to.eql([BIG_NUMBER_1E18, BigNumber.from(1e6), BigNumber.from(1e6)])
    })
  })

  describe("getEligiblePools", () => {
    it("Successfully gets all eligible pools", async () => {
      await poolRegistry.addPool(usdv2Data)
      await poolRegistry.addPool(susdMetaV2Data)

      // tokens
      const dai = (await get(DAI_CONTRACT_NAME)).address
      const usdc = (await get(USDC_CONTRACT_NAME)).address
      const saddleUSDLPToken = (await get(USD_V2_LP_TOKEN_CONTRACT_NAME))
        .address
      const susd = (await get(SUSD_CONTRACT_NAME)).address

      // pools
      const usdv2Pool = (await get(USD_POOL_CONTRACT_NAME)).address
      const susdPool = (await get(SUSD_META_POOL_CONTRACT_NAME)).address
      const susdPoolDeposit = (await get(SUSD_META_POOL_DEPOSIT_CONTRACT_NAME))
        .address

      expect(
        await poolRegistry.getEligiblePools(dai, usdc),
        "dai, usdc",
      ).to.eql([usdv2Pool])
      expect(
        await poolRegistry.getEligiblePools(dai, saddleUSDLPToken),
        "dai, lptoken",
      ).to.eql([])
      expect(
        await poolRegistry.getEligiblePools(susd, usdc),
        "susd, usdc",
      ).to.eql([susdPoolDeposit])
      expect(
        await poolRegistry.getEligiblePools(saddleUSDLPToken, susd),
        "lptoken, susd",
      ).to.eql([susdPool])
      expect(
        await poolRegistry.getEligiblePools(dai, susd),
        "dai, susd",
      ).to.eql([susdPoolDeposit])
    })
  })

  describe("getPaused", () => {
    it("Successfully gets paused status", async () => {
      await poolRegistry.addPool(usdv2Data)
      expect(await poolRegistry.callStatic.getPaused(usdv2Data.poolAddress)).to
        .be.false
      ;(
        (await ethers.getContractAt("Swap", usdv2Data.poolAddress)) as Swap
      ).pause()
      expect(await poolRegistry.callStatic.getPaused(usdv2Data.poolAddress)).to
        .be.true
    })
  })

  describe("getSwapStorage", () => {
    it("Successfully fetches swapStorage from a regular Swap", async () => {
      await poolRegistry.addPool(usdv2Data)
      const swap = (await ethers.getContractAt(
        "Swap",
        usdv2Data.poolAddress,
      )) as Swap
      expect(await poolRegistry.getSwapStorage(usdv2Data.poolAddress)).to.eql(
        await swap.swapStorage(),
      )
    })

    it("Successfully fetches swapStorage from a guarded Swap", async () => {
      await poolRegistry.addPool(guardedBtcInputData)
      const guardedSwap = (await ethers.getContractAt(
        "SwapGuarded",
        guardedBtcInputData.poolAddress,
      )) as ISwapGuarded
      const swapStorage = [...(await guardedSwap.swapStorage())]
      swapStorage.splice(6, 1)
      expect(
        await poolRegistry.getSwapStorage(guardedBtcInputData.poolAddress),
      ).to.eql(swapStorage)
    })

    it("Reverts when querying an unregistered pool address", async () => {
      await expect(
        poolRegistry.getSwapStorage(guardedBtcInputData.poolAddress),
      ).to.be.revertedWith("PR: No matching pool found")
    })
  })
})
