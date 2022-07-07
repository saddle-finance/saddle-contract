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
  PermissionlessDeployer,
  PermissionlessSwap,
  PoolRegistry,
} from "../../build/typechain/"
import { PoolType } from "../../utils/constants"
import {
  asyncForEach,
  getCurrentBlockTimestamp,
  MAX_UINT256,
  setNextTimestamp,
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
  let deploySwapInput: PermissionlessDeployer.DeploySwapInputStruct
  let deployMetaSwapInput: PermissionlessDeployer.DeployMetaSwapInputStruct
  let usdv2Data: IPoolRegistry.PoolDataStruct
  let susdMetaV2Data: IPoolRegistry.PoolDataStruct
  let guardedBtcData: IPoolRegistry.PoolDataStruct
  let usdv2InputData: IPoolRegistry.PoolInputDataStruct
  let susdMetaV2InputData: IPoolRegistry.PoolInputDataStruct
  let guardedBtcInputData: IPoolRegistry.PoolInputDataStruct

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
    await permissionlessDeployer.deploySwap(deploySwapInput)
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
    await permissionlessDeployer.deployMetaSwap(deployMetaSwapInput)
  }

  describe("deploySwap", () => {
    it("Successfully deploys MetaSwap", async () => {
      await testDeploySwap()
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
    it("Successfully deploys Swap", async () => {
      await testDeploySwap()
      await testDeployMetaSwap()
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

  describe("withdrawAdminFees", () => {
    it("Successfully withdraws accrued admin trading fees", async () => {
      await testDeploySwap()
      await testDeployMetaSwap()

      const poolData: IPoolRegistry.PoolDataStructOutput =
        await poolRegistry.getPoolDataByName(BYTES32_FRAX_POOL_NAME)
      const permissionlessSwapContract = await ethers.getContractAt(
        PERMISSIONLESS_SWAP_NAME,
        poolData.poolAddress,
      )

      // Approve transfer of base pool tokens
      await asyncForEach(poolData.tokens, async (token) => {
        const tokenContract = await ethers.getContractAt(
          GENERIC_ERC20_CONTRACT_NAME,
          token,
        )
        await tokenContract.approve(
          permissionlessSwapContract.address,
          MAX_UINT256,
        )
      })

      // Add liquidity
      await permissionlessSwapContract.addLiquidity(
        [String(3e6), String(3e18), String(3e18)],
        0,
        MAX_UINT256,
      )

      const baseLPToken: LPToken = await ethers.getContractAt(
        LP_TOKEN_NAME,
        poolData.lpToken,
      )

      expect(await baseLPToken.name()).to.be.eq(
        String(`Saddle ${await baseLPToken.symbol()} LP Token`),
      )
      const actualPoolTokenAmount = await baseLPToken.balanceOf(deployerAddress)

      // The actual pool token amount is less than 4e18 due to the imbalance of the underlying tokens
      expect(actualPoolTokenAmount).to.eq(BigNumber.from(String(9e18)))

      // Function to return map of current token balances
      async function getTokenBalances(
        tokenAddresses: string[],
        userAddress: string,
      ) {
        const balances: BigNumber[] = []
        await asyncForEach(tokenAddresses, async (tokenAddress) => {
          const tokenContract = await ethers.getContractAt(
            GENERIC_ERC20_CONTRACT_NAME,
            tokenAddress,
          )
          const token_balance = await tokenContract.balanceOf(userAddress)
          balances.push(token_balance)
        })
        return balances
      }

      // swap each token 20 times
      for (let i = 0; i < 20; i++) {
        await permissionlessSwapContract.swap(0, 1, 1e6, 0, MAX_UINT256)
        await permissionlessSwapContract.swap(0, 2, 1e6, 0, MAX_UINT256)
        await permissionlessSwapContract.swap(
          1,
          0,
          String(1e18),
          0,
          MAX_UINT256,
        )
        await permissionlessSwapContract.swap(
          1,
          2,
          String(1e18),
          0,
          MAX_UINT256,
        )
        await permissionlessSwapContract.swap(
          2,
          0,
          String(1e18),
          0,
          MAX_UINT256,
        )
        await permissionlessSwapContract.swap(
          2,
          1,
          String(1e18),
          0,
          MAX_UINT256,
        )
      }

      // get balances of each token after the swaps
      const feeCollectorBalances = await getTokenBalances(
        poolData.tokens,
        deployerAddress,
      )

      // withdraw admin fees
      await permissionlessSwapContract.connect(user1).withdrawAdminFees()

      // expect correct changes in token balances after admin fee withdrawal
      const feeCollectorBalancesWithFees = await getTokenBalances(
        poolData.tokens,
        deployerAddress,
      )
      const user1BalancesWithFees = await getTokenBalances(
        poolData.tokens,
        user1Address,
      )

      expect(
        user1BalancesWithFees.every((value) => value.gt(BigNumber.from(0))),
      ).to.be.true

      for (let i = 0; i < feeCollectorBalances.length; i++) {
        expect(feeCollectorBalances[i]).to.lt(feeCollectorBalancesWithFees[i])
      }

      // Metapool

      const metaPoolData: IPoolRegistry.PoolDataStructOutput =
        await poolRegistry.getPoolDataByName(BYTES32_FRAX_METAPOOL_NAME)
      const permissionlessMetaSwapContract = await ethers.getContractAt(
        PERMISSIONLESS_METASWAP_NAME,
        metaPoolData.poolAddress,
      )

      // Approve transfer of base pool and meta pool token

      const metaLPToken = await ethers.getContractAt(
        LP_TOKEN_NAME,
        metaPoolData.lpToken,
      )
      expect(await metaLPToken.name()).to.be.eq(
        String(`Saddle ${await metaLPToken.symbol()} LP Token`),
      )

      const sUSDContract = await ethers.getContractAt(
        GENERIC_ERC20_CONTRACT_NAME,
        metaPoolData.tokens[0],
      )
      await baseLPToken.approve(
        permissionlessMetaSwapContract.address,
        MAX_UINT256,
      )
      await sUSDContract.approve(
        permissionlessMetaSwapContract.address,
        MAX_UINT256,
      )

      // fast forward block 10 minutes to allow metapool to cache base pool vitrual price
      const currentTimestamp = await getCurrentBlockTimestamp()
      await setNextTimestamp(currentTimestamp + 60 * 10)
      await ethers.provider.send("evm_mine", [])

      // Add liquidity to metapool
      await permissionlessMetaSwapContract.addLiquidity(
        [String(1e18), String(1e18)],
        0,
        MAX_UINT256,
      )

      expect(
        await sUSDContract.balanceOf(permissionlessMetaSwapContract.address),
      ).to.eq(String(1e18))
      expect(
        await baseLPToken.balanceOf(permissionlessMetaSwapContract.address),
      ).to.eq(String(1e18))

      // Function to return map of current token balances
      async function getMetaTokenBalances(userAddress: string) {
        const balances: BigNumber[] = []
        balances.push(await sUSDContract.balanceOf(deployerAddress))
        balances.push(await baseLPToken.balanceOf(deployerAddress))
        return balances
      }

      const metaLPTokenBal = await baseLPToken.balanceOf(poolData.lpToken)

      // swap each token 20 times
      for (let i = 0; i < 20; i++) {
        await permissionlessMetaSwapContract.swap(
          0,
          1,
          String(1e18),
          0,
          MAX_UINT256,
        )
        await permissionlessMetaSwapContract.swap(
          1,
          0,
          String(1e18),
          0,
          MAX_UINT256,
        )
      }

      // // get balances of each token after the swaps
      const metafeeCollectorBalances = await getMetaTokenBalances(
        deployerAddress,
      )

      const metauser1Balances = await getMetaTokenBalances(user1Address)

      // withdraw admin fees
      await permissionlessMetaSwapContract.connect(user1).withdrawAdminFees()

      // expect correct changes in token balances after admin fee withdrawal
      const metafeeCollectorBalancesWithFees = await getMetaTokenBalances(
        deployerAddress,
      )
      const metauser1BalancesWithFees = await getMetaTokenBalances(user1Address)

      expect(
        metauser1BalancesWithFees.every((value) => value.gt(BigNumber.from(0))),
      ).to.be.true

      for (let i = 0; i < metafeeCollectorBalancesWithFees.length; i++) {
        expect(metafeeCollectorBalancesWithFees[i]).to.gt(
          metafeeCollectorBalances[i],
        )
      }
      for (let i = 0; i < metafeeCollectorBalancesWithFees.length; i++) {
        expect(metauser1BalancesWithFees[i]).to.gt(metauser1Balances[i])
      }
    })
  })
})
