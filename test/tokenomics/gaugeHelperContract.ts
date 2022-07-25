import chai from "chai"
import { solidity } from "ethereum-waffle"
import { deployments, ethers } from "hardhat"
import {
  LPToken,
  Swap,
  LiquidityGaugeV5,
  GaugeHelperContract,
  IPoolRegistry,
  LiquidityGaugeV5__factory,
  PoolRegistry,
} from "../../build/typechain/"
import { PoolType } from "../../utils/constants"
import { ZERO_ADDRESS } from "../testUtils"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

const WEEK = 86400 * 7
const MAXTIME = 86400 * 365 * 4
const LOCK_START_TIMESTAMP = 2362003200

const USD_V2_SWAP_NAME = "SaddleUSDPoolV2"
const USD_V2_LP_TOKEN_NAME = `${USD_V2_SWAP_NAME}LPToken`
const USD_V2_GAUGE_NAME = `LiquidityGaugeV5_${USD_V2_LP_TOKEN_NAME}`
const SWAP_FLASHLOAN_NAME = "SwapFlashLoan"
const MINTER_NAME = "Minter"
const POOL_REGISTRY_NAME = "PoolRegistry"
const LIQUIDITY_GAUGE_NAME = "LiquidityGaugeV5"
const GAUGE_HELPER_CONTRACT_NAME = "GaugeHelperContract"

const DAI_CONTRACT_NAME = "DAI"
const USDC_CONTRACT_NAME = "USDC"
const USDT_CONTRACT_NAME = "USDT"

const BYTES32_USDV2_POOL_NAME = ethers.utils.formatBytes32String("USDv2")

describe("GaugeHelperContract", () => {
  let usdv2Gauge: LiquidityGaugeV5
  let usdv2LpToken: LPToken
  let usdv2Swap: Swap
  let poolRegistry: PoolRegistry
  let gaugeHelperContract: GaugeHelperContract
  let usdv2Data: IPoolRegistry.PoolDataStruct

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture(["USDPoolV2", "veSDL"], {
        fallbackToGlobal: false,
      }) // ensure you start from a fresh deployments

      const deployer = (await ethers.getSigners())[0]
      const minter = await ethers.getContract(MINTER_NAME)

      usdv2Swap = await ethers.getContract(USD_V2_SWAP_NAME)
      usdv2LpToken = await ethers.getContract(USD_V2_LP_TOKEN_NAME)
      gaugeHelperContract = await ethers.getContract(GAUGE_HELPER_CONTRACT_NAME)
      poolRegistry = await ethers.getContract(POOL_REGISTRY_NAME)

      // Deploy the gauge
      const gaugeFactory: LiquidityGaugeV5__factory =
        await ethers.getContractFactory(LIQUIDITY_GAUGE_NAME)
      usdv2Gauge = await gaugeFactory.deploy(
        usdv2LpToken.address,
        minter.address,
        deployer.address,
      )

      // Register usdv2 pool in the pool registry
      const usdv2PoolInput: IPoolRegistry.PoolInputDataStruct = {
        // USDv2 pool
        poolAddress: (await get(USD_V2_SWAP_NAME)).address,
        typeOfAsset: PoolType.USD,
        poolName: BYTES32_USDV2_POOL_NAME,
        targetAddress: (await get(SWAP_FLASHLOAN_NAME)).address,
        metaSwapDepositAddress: ZERO_ADDRESS,
        isSaddleApproved: true,
        isRemoved: false,
        isGuarded: false,
      }
      await poolRegistry.addPool(usdv2PoolInput)

      usdv2Data = {
        poolAddress: usdv2PoolInput.poolAddress,
        lpToken: (await get(USD_V2_LP_TOKEN_NAME)).address,
        typeOfAsset: usdv2PoolInput.typeOfAsset,
        poolName: usdv2PoolInput.poolName,
        targetAddress: usdv2PoolInput.targetAddress,
        tokens: [
          (await get(DAI_CONTRACT_NAME)).address,
          (await get(USDC_CONTRACT_NAME)).address,
          (await get(USDT_CONTRACT_NAME)).address,
        ],
        underlyingTokens: [],
        basePoolAddress: ZERO_ADDRESS,
        metaSwapDepositAddress: ZERO_ADDRESS,
        isSaddleApproved: usdv2PoolInput.isSaddleApproved,
        isRemoved: usdv2PoolInput.isRemoved,
        isGuarded: usdv2PoolInput.isGuarded,
      }
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  describe("gaugeToPoolAddress", () => {
    it(`Returns correct pool address when LiquityGaugeV5 with Saddle pool is passed`, async () => {
      const gaugeAddress = await gaugeHelperContract.gaugeToPoolAddress(
        usdv2Gauge.address,
      )
      expect(gaugeAddress).to.be.eq(usdv2Swap.address)
    })
    it(`Returns ZERO_ADDRESS when invalid address is passed`, async () => {
      const gaugeAddress = await gaugeHelperContract.gaugeToPoolAddress(
        usdv2Swap.address,
      )
      expect(gaugeAddress).to.be.eq(ZERO_ADDRESS)
    })
  })

  describe("gaugeToPoolData", () => {
    it(`Returns correct pool data when LiquityGaugeV5 with Saddle pool is passed`, async () => {
      const poolData = await gaugeHelperContract.gaugeToPoolData(
        usdv2Gauge.address,
      )
      expect(poolData).to.be.eql(Object.values(usdv2Data))
    })
    it(`Returns empty pool data when invalid address is passed`, async () => {
      const poolData = await gaugeHelperContract.gaugeToPoolData(
        usdv2Swap.address,
      )
      const emptyPoolData: IPoolRegistry.PoolDataStruct = {
        poolAddress: ZERO_ADDRESS,
        lpToken: ZERO_ADDRESS,
        typeOfAsset: 0,
        poolName: ethers.constants.HashZero,
        targetAddress: ZERO_ADDRESS,
        tokens: [],
        underlyingTokens: [],
        basePoolAddress: ZERO_ADDRESS,
        metaSwapDepositAddress: ZERO_ADDRESS,
        isSaddleApproved: false,
        isRemoved: false,
        isGuarded: false,
      }
      expect(poolData).to.be.eql(Object.values(emptyPoolData))
    })
  })
})
