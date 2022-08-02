/* eslint-disable prettier/prettier */
/*eslint max-len: ["error", { "code": 150 }]*/

import chai from "chai"
import { solidity } from "ethereum-waffle"
import { BigNumber, ContractFactory, Signer } from "ethers"
import { deployments, ethers } from "hardhat"
import {
  IPoolRegistry,
  LPToken,
  MasterRegistry,
  MetaSwap,
  PermissionlessDeployer,
  PermissionlessMetaSwap,
  PermissionlessSwap,
  PoolRegistry,
  Swap,
} from "../../build/typechain/"
import { PoolType } from "../../utils/constants"
import {
  getCurrentBlockTimestamp,
  getUserTokenBalances,
  MAX_UINT256,
  setTimestamp,
} from "../testUtils"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

// Test constant values
const TEST_FRAX_USD_POOL_NAME = "FraxUSD"
const TEST_FRAX_LP_TOKEN_NAME = "FraxUSD LP Token"
const TEST_FRAX_USD_METAPOOL_NAME = "sUSD-FraxUSD"
const TEST_FRAX_LP_META_TOKEN_NAME = "sUSD-FraxUSD LP Token"
const SAMPLE_A_PARAM = BigNumber.from(1000)
const SAMPLE_TRADING_FEE = BigNumber.from(0.04e8) // 4bps
const SAMPLE_ADMIN_FEE = BigNumber.from(50e8) // 50%
const USDC_CONTRACT_NAME = "USDC"
const DAI_CONTRACT_NAME = "DAI"
const FRAX_CONTRACT_NAME = "FRAX"
const SUSD_CONTRACT_NAME = "SUSD"
const POOL_REGISTRY_NAME = "PoolRegistry"
const MASTER_REGISTRY_NAME = "MasterRegistry"
const PERMISSIONLESS_SWAP_NAME = "PermissionlessSwap"
const PERMISSIONLESS_METASWAP_NAME = "PermissionlessMetaSwap"
const LP_TOKEN_NAME = "LPToken"
const GENERIC_ERC20_CONTRACT_NAME = "GenericERC20"
const PERMISSIONLESS_DEPLOYER_NAME = "PermissionlessDeployer"
const PERMISSIONLESS_SWAPFLASHLOAN_NAME = "PermissionlessSwapFlashLoan"
const BYTES32_FRAX_POOL_NAME = ethers.utils.formatBytes32String(
  TEST_FRAX_USD_POOL_NAME,
)
const BYTES32_FRAX_METAPOOL_NAME = ethers.utils.formatBytes32String(
  TEST_FRAX_USD_METAPOOL_NAME,
)

const AMOUNT = BigNumber.from(String(1e17))
const INFLATED_VP = BigNumber.from("1020790547891975684")

describe("PermissionlessDeployer", async () => {
  let signers: Array<Signer>
  let deployer: Signer
  let user1: Signer
  let user2: Signer
  let deployerAddress: string
  let user1Address: string
  let poolRegistry: PoolRegistry
  let masterRegistry: MasterRegistry
  let masterRegistryFactory: ContractFactory
  let registryFactory: ContractFactory
  let permissionlessDeployer: PermissionlessDeployer
  let permissionlessSwap: PermissionlessSwap
  let permissionlessMetaSwap: PermissionlessMetaSwap
  let deploySwapInput: PermissionlessDeployer.DeploySwapInputStruct
  let deployMetaSwapInput: PermissionlessDeployer.DeployMetaSwapInputStruct
  let usdv2Data: IPoolRegistry.PoolDataStruct
  let susdMetaV2Data: IPoolRegistry.PoolDataStruct
  let guardedBtcData: IPoolRegistry.PoolDataStruct
  let usdv2InputData: IPoolRegistry.PoolInputDataStruct
  let susdMetaV2InputData: IPoolRegistry.PoolInputDataStruct
  let guardedBtcInputData: IPoolRegistry.PoolInputDataStruct
  let baseSwap: Swap
  let baseLpToken: LPToken
  let metaSwap: MetaSwap
  let metaLpToken: LPToken

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      user1 = signers[1]
      user2 = signers[2]
      deployerAddress = await deployer.getAddress()
      user1Address = ethers.utils.getAddress(await user1.getAddress())
      permissionlessDeployer = (await ethers.getContract(
        PERMISSIONLESS_DEPLOYER_NAME,
      )) as PermissionlessDeployer
      poolRegistry = (await ethers.getContract(
        POOL_REGISTRY_NAME,
      )) as PoolRegistry
      masterRegistry = (await ethers.getContract(
        MASTER_REGISTRY_NAME,
      )) as MasterRegistry
      permissionlessSwap = (await ethers.getContract(
        PERMISSIONLESS_SWAPFLASHLOAN_NAME,
      )) as PermissionlessSwap

      const baseSwapAddress = await testDeploySwap()
      baseSwap = await ethers.getContractAt("Swap", baseSwapAddress)
      const metaSwapAddresses = await testDeployMetaSwap()
      metaSwap = await ethers.getContractAt(
        "MetaSwap",
        metaSwapAddresses.deployedMetaSwap,
      )

      // Add some inital liquidity to the deployed pools
      const baseSwapData = await poolRegistry.getPoolData(baseSwapAddress)
      await Promise.all(
        baseSwapData.tokens.map(async (token) => {
          const tokenContract = await ethers.getContractAt(
            GENERIC_ERC20_CONTRACT_NAME,
            token,
          )
          await tokenContract.approve(baseSwapAddress, MAX_UINT256)
          await tokenContract.approve(metaSwap.address, MAX_UINT256)
        }),
      )
      await baseSwap.addLiquidity(
        [
          BigNumber.from(1e8),
          BigNumber.from(String(1e20)),
          BigNumber.from(String(1e20)),
        ],
        0,
        MAX_UINT256,
      )

      // Approve base lp token to be burned
      baseLpToken = await ethers.getContractAt(
        "GenericERC20",
        baseSwapData.lpToken,
      )
      await baseLpToken.approve(baseSwapAddress, MAX_UINT256)

      // Wait for virtual price to update
      await setTimestamp((await getCurrentBlockTimestamp()) + 600)
      // Add liquidity to the deployed metapool
      const metaSwapData = await poolRegistry.getPoolData(
        metaSwapAddresses.deployedMetaSwap,
      )
      await Promise.all(
        metaSwapData.tokens.map(async (token) => {
          const tokenContract = await ethers.getContractAt(
            GENERIC_ERC20_CONTRACT_NAME,
            token,
          )
          await tokenContract.approve(metaSwap.address, MAX_UINT256)
        }),
      )
      await metaSwap.addLiquidity(
        [BigNumber.from(String(1e20)), BigNumber.from(String(1e20))],
        0,
        MAX_UINT256,
      )

      // Approve LP token to be burned
      metaLpToken = await ethers.getContractAt(
        "GenericERC20",
        metaSwapData.lpToken,
      )
      await metaLpToken.approve(metaSwap.address, MAX_UINT256)

      // swap between each token pairs to inflate admin fees and
      for (let k = 0; k < 100; k++) {
        await baseSwap.swap(0, 1, String(1e8), 0, MAX_UINT256)
        await baseSwap.swap(1, 2, String(1e20), 0, MAX_UINT256)
        await baseSwap.swap(2, 0, String(1e20), 0, MAX_UINT256)
      }

      console.log((await baseSwap.getVirtualPrice()).toString())

      // Wait for cache to update
      await setTimestamp((await getCurrentBlockTimestamp()) + 600)
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  async function testDeploySwap() {
    // Deploys a community pool and registers it in the PoolRegistry
    deploySwapInput = {
      poolName: ethers.utils.formatBytes32String(TEST_FRAX_USD_POOL_NAME),
      tokens: [
        (await get(USDC_CONTRACT_NAME)).address,
        (await get(DAI_CONTRACT_NAME)).address,
        (await get(FRAX_CONTRACT_NAME)).address,
      ],
      decimals: [6, 18, 18],
      lpTokenSymbol: TEST_FRAX_USD_POOL_NAME,
      a: SAMPLE_A_PARAM,
      fee: SAMPLE_TRADING_FEE,
      adminFee: SAMPLE_ADMIN_FEE,
      owner: user1Address,
      typeOfAsset: PoolType.USD,
    }
    const expectedAddress = await permissionlessDeployer.callStatic.deploySwap(
      deploySwapInput,
    )
    await permissionlessDeployer.deploySwap(deploySwapInput)
    return expectedAddress
  }

  async function testDeployMetaSwap() {
    const poolData: IPoolRegistry.PoolDataStruct =
      await poolRegistry.getPoolDataByName(
        ethers.utils.formatBytes32String(TEST_FRAX_USD_POOL_NAME),
      )

    // Deploys a community meta pool and registers it in the PoolRegistry
    deployMetaSwapInput = {
      poolName: BYTES32_FRAX_METAPOOL_NAME,
      tokens: [(await get(SUSD_CONTRACT_NAME)).address, poolData.lpToken],
      decimals: [18, 18],
      lpTokenSymbol: TEST_FRAX_LP_META_TOKEN_NAME,
      a: SAMPLE_A_PARAM,
      fee: SAMPLE_TRADING_FEE,
      adminFee: SAMPLE_ADMIN_FEE,
      owner: user1Address,
      typeOfAsset: PoolType.USD,
      baseSwap: poolData.poolAddress,
    }
    const expectedAddress =
      await permissionlessDeployer.callStatic.deployMetaSwap(
        deployMetaSwapInput,
      )
    await permissionlessDeployer.deployMetaSwap(deployMetaSwapInput)
    return expectedAddress
  }

  describe("deploySwap", () => {
    it("Successfully deploys Swap", async () => {
      const poolData: IPoolRegistry.PoolDataStruct =
        await poolRegistry.getPoolDataByName(
          ethers.utils.formatBytes32String(TEST_FRAX_USD_POOL_NAME),
        )
      expect(poolData.poolName).to.equal(
        ethers.utils.formatBytes32String(TEST_FRAX_USD_POOL_NAME),
      )
    })
  })

  describe("deployMetaSwap", () => {
    it("Successfully deploys MetaSwap", async () => {
      const poolData: IPoolRegistry.PoolDataStruct =
        await poolRegistry.getPoolDataByName(BYTES32_FRAX_METAPOOL_NAME)
      expect(poolData.poolName).to.equal(BYTES32_FRAX_METAPOOL_NAME)
    })
  })

  describe("poolRegistryCached", () => {
    it("Successfully reads poolRegistryCached ", async () => {
      expect(await permissionlessDeployer.poolRegistryCached()).to.eq(
        (await get(POOL_REGISTRY_NAME)).address,
      )
    })
  })

  describe("setTargetLPToken", () => {
    it("Successfully sets targetLPToken", async () => {
      // Using an arbitrary address to test
      const targetLPToken = (await get(DAI_CONTRACT_NAME)).address
      await permissionlessDeployer.setTargetLPToken(targetLPToken)
      expect(await permissionlessDeployer.targetLPToken()).to.eq(targetLPToken)
    })
  })

  describe("setTargetSwap", () => {
    it("Successfully sets targetSwap", async () => {
      // Using an arbitrary address to test
      const targetSwap = (await get(DAI_CONTRACT_NAME)).address
      await permissionlessDeployer.setTargetSwap(targetSwap)
      expect(await permissionlessDeployer.targetSwap()).to.eq(targetSwap)
    })
  })

  describe("setTargetMetaSwap", () => {
    it("Successfully sets targetMetaSwap", async () => {
      // Using an arbitrary address to test
      const targetMetaSwap = (await get(DAI_CONTRACT_NAME)).address
      await permissionlessDeployer.setTargetMetaSwap(targetMetaSwap)
      expect(await permissionlessDeployer.targetMetaSwap()).to.eq(
        targetMetaSwap,
      )
    })
  })

  describe("setTargetMetaSwapDeposit", () => {
    it("Successfully sets targetMetaSwapDeposit", async () => {
      // Using an arbitrary address to test
      const targetMetaSwapDeposit = (await get(DAI_CONTRACT_NAME)).address
      await permissionlessDeployer.setTargetMetaSwapDeposit(
        targetMetaSwapDeposit,
      )
      expect(await permissionlessDeployer.targetMetaSwapDeposit()).to.eq(
        targetMetaSwapDeposit,
      )
    })
  })

  describe("Invariant holds", () => {
    beforeEach(async () => {
      const swapData: IPoolRegistry.PoolDataStructOutput =
        await poolRegistry.getPoolDataByName(
          ethers.utils.formatBytes32String(TEST_FRAX_USD_POOL_NAME),
        )
      baseSwap = await ethers.getContractAt(
        "PermissionlessSwapFlashLoan",
        swapData.poolAddress,
      )

      const metaSwapData: IPoolRegistry.PoolDataStructOutput =
        await poolRegistry.getPoolDataByName(BYTES32_FRAX_METAPOOL_NAME)
      metaSwap = await ethers.getContractAt(
        "PermissionlessMetaSwapFlashLoan",
        metaSwapData.poolAddress,
      )

      //
    })

    describe("addLiquidity", () => {
      it("Virtual price doesn't decrease after depositing only susd", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.addLiquidity([String(AMOUNT), 0], 0, MAX_UINT256)
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })

      it("Virtual price doesn't decrease after depositing only baseLPToken", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.addLiquidity([0, String(AMOUNT)], 0, MAX_UINT256)
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    })

    describe("removeLiquidity", () => {
      it("Virtual price doesn't decrease after removeLiquidity", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.removeLiquidity(String(AMOUNT), [0, 0], MAX_UINT256)
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    })

    describe("removeLiquidityImbalance", () => {
      it("Virtual price doesn't decrease after removeLiquidityImbalance susd", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.removeLiquidityImbalance(
          [AMOUNT, 0],
          BigNumber.from(AMOUNT).mul(2),
          MAX_UINT256,
        )
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })

      it("Virtual price doesn't decrease after removeLiquidityImbalance baseLPToken", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.removeLiquidityImbalance(
          [0, AMOUNT],
          BigNumber.from(AMOUNT).mul(2),
          MAX_UINT256,
        )
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    })

    describe("removeLiquidityOneToken", () => {
      it("Virtual price doesn't decrease after removeLiquidityOneToken susd", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.removeLiquidityOneToken(
          String(AMOUNT),
          0,
          0,
          MAX_UINT256,
        )
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })

      it("Virtual price doesn't decrease after removeLiquidityOneToken baseLPToken", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.removeLiquidityOneToken(
          String(AMOUNT),
          1,
          0,
          MAX_UINT256,
        )
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
      })
    })

    describe("swap", () => {
      const expectedAdminFeeValueBaseLPToken = BigNumber.from(2e13)

      it("Virtual price doesn't decrease after swap susd -> baseLPToken", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.swap(0, 1, String(AMOUNT), 0, MAX_UINT256)
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
        // We expect the increase in admin balance of base LP token to be valued at
        // swap value * 50% * 0.04%
        // Since the values aren't exact due to approximations, we test against +-0.01% delta
        const adminFeeValue = (await metaSwap.getAdminBalance(1))
          .mul(INFLATED_VP)
          .div(String(1e18))
        expect(adminFeeValue)
          .gte(
            expectedAdminFeeValueBaseLPToken
              .mul(String(9999e14))
              .div(String(1e18)),
          )
          .and.lte(
            expectedAdminFeeValueBaseLPToken
              .mul(String(10001e14))
              .div(String(1e18)),
          )
        console.log(
          `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueBaseLPToken}`,
        )
      })

      it("Virtual price doesn't decrease after swap baseLPToken -> susd", async () => {
        const expectedDepositedBaseLpTokenAmount =
          await baseSwap.callStatic.addLiquidity(
            [0, String(AMOUNT), 0],
            0,
            MAX_UINT256,
          )

        const expectedSwapValue = expectedDepositedBaseLpTokenAmount
          .mul(INFLATED_VP)
          .div(String(1e18))
        const expectedAdminFeeValueSUSD = expectedSwapValue
          .mul(2e14)
          .div(String(1e18))

        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.swap(
          1,
          0,
          expectedDepositedBaseLpTokenAmount,
          0,
          MAX_UINT256,
        )
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
        // We expect the increase in admin balance of susd to be valued at
        // swap value * 50% * 0.04%
        // Since the values aren't exact due to approximations, we test against +-0.05% delta
        const adminFeeValue = await metaSwap.getAdminBalance(0)
        expect(adminFeeValue)
          .gte(expectedAdminFeeValueSUSD.mul(String(9999e14)).div(String(1e18)))
          .and.lte(
            expectedAdminFeeValueSUSD.mul(String(10001e14)).div(String(1e18)),
          )
        console.log(
          `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueSUSD}`,
        )
      })
    })

    describe("swapUnderlying", () => {
      const expectedAdminFeeValueBaseLPToken = BigNumber.from(2e13)

      it("Virtual price doesn't decrease after swapUnderlying susd -> dai", async () => {
        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.swapUnderlying(0, 2, String(AMOUNT), 0, MAX_UINT256)
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
        const adminFeeValue = (await metaSwap.getAdminBalance(1))
          .mul(INFLATED_VP)
          .div(String(1e18))
        expect(adminFeeValue)
          .gte(
            expectedAdminFeeValueBaseLPToken
              .mul(String(9999e14))
              .div(String(1e18)),
          )
          .and.lte(
            expectedAdminFeeValueBaseLPToken
              .mul(String(10001e14))
              .div(String(1e18)),
          )
        console.log(
          `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueBaseLPToken}`,
        )
      })

      it("Virtual price doesn't decrease after swapUnderlying dai -> susd", async () => {
        const expectedDepositedBaseLpTokenAmount =
          await baseSwap.callStatic.addLiquidity(
            [0, String(AMOUNT), 0],
            0,
            MAX_UINT256,
          )
        const expectedSwapValue = expectedDepositedBaseLpTokenAmount
          .mul(INFLATED_VP)
          .div(String(1e18))
        const expectedAdminFeeValueSUSD = expectedSwapValue
          .mul(2e14)
          .div(String(1e18))

        const virtualPriceBefore = await metaSwap.getVirtualPrice()
        await metaSwap.swapUnderlying(2, 0, String(AMOUNT), 0, MAX_UINT256)
        expect(await metaSwap.getVirtualPrice()).to.gte(virtualPriceBefore)
        const adminFeeValue = await metaSwap.getAdminBalance(0)
        expect(adminFeeValue)
          .gte(expectedAdminFeeValueSUSD.mul(String(9999e14)).div(String(1e18)))
          .and.lte(
            expectedAdminFeeValueSUSD.mul(String(10001e14)).div(String(1e18)),
          )
        console.log(
          `Actual admin fee increase: ${adminFeeValue}, ideal value: ${expectedAdminFeeValueSUSD}`,
        )
      })
    })
  })

  describe("withdrawAdminFees", () => {
    it("Successfully withdraws accrued admin trading fees from base swap", async () => {
      const tokens = (await poolRegistry.getPoolData(baseSwap.address)).tokens

      const collectorBalBefore = await getUserTokenBalances(
        deployerAddress,
        tokens,
      )
      const adminBalBefore = await getUserTokenBalances(user1Address, tokens)
      const vpBefore = await baseSwap.getVirtualPrice()

      await baseSwap.withdrawAdminFees()

      const collectorBalAfter = await getUserTokenBalances(
        deployerAddress,
        tokens,
      )
      const adminBarAfter = await getUserTokenBalances(user1Address, tokens)
      const vpAfter = await baseSwap.getVirtualPrice()

      const collectorBalDelta = collectorBalAfter.map((bal, i) =>
        bal.sub(collectorBalBefore[i]),
      )
      const adminBalDelta = adminBarAfter.map((bal, i) =>
        bal.sub(adminBalBefore[i]),
      )
      const expectedDelta = [
        BigNumber.from("1004118"),
        BigNumber.from("997505689639501527"),
        BigNumber.from("998328057497365569"),
      ]
      expect(collectorBalDelta).to.eql(expectedDelta)
      expect(adminBalDelta).to.eql(expectedDelta)
      expect(vpAfter).to.eq(vpBefore)
    })

    it("Successfully withdraws accrued admin trading fees from meta swap", async () => {
      // swap each token 20 times
      for (let i = 0; i < 20; i++) {
        await metaSwap.swap(0, 1, String(1e18), 0, MAX_UINT256)
        await metaSwap.swap(1, 0, String(1e18), 0, MAX_UINT256)
      }

      const tokens = (await poolRegistry.getPoolData(metaSwap.address)).tokens

      const collectorBalBefore = await getUserTokenBalances(
        deployerAddress,
        tokens,
      )
      const adminBalBefore = await getUserTokenBalances(user1Address, tokens)
      const vpBefore = await metaSwap.getVirtualPrice()

      await metaSwap.withdrawAdminFees()

      const collectorBalAfter = await getUserTokenBalances(
        deployerAddress,
        tokens,
      )
      const adminBarAfter = await getUserTokenBalances(user1Address, tokens)
      const vpAfter = await metaSwap.getVirtualPrice()

      const collectorBalDelta = collectorBalAfter.map((bal, i) =>
        bal.sub(collectorBalBefore[i]),
      )
      const adminBalDelta = adminBarAfter.map((bal, i) =>
        bal.sub(adminBalBefore[i]),
      )
      const expectedDelta = [
        BigNumber.from("2041550919186710"),
        BigNumber.from("1959294344559532"),
      ]
      expect(collectorBalDelta).to.eql(expectedDelta)
      expect(adminBalDelta).to.eql(expectedDelta)
      expect(vpAfter).to.eq(vpBefore)
    })
  })
})
