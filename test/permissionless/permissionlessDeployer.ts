/* eslint-disable prettier/prettier */
/*eslint max-len: ["error", { "code": 150 }]*/

import { BigNumber, ContractFactory, Signer } from "ethers"
import { solidity } from "ethereum-waffle"

import chai from "chai"
import { deployments, ethers } from "hardhat"
import {
  PoolRegistry,
  PoolDataStruct,
  PoolInputDataStruct,
} from "../../build/typechain/PoolRegistry"
import { MasterRegistry } from "../../build/typechain/MasterRegistry"
import { LPToken, PermissionlessDeployer, PermissionlessSwap } from "../../build/typechain"
import {
  DeployMetaSwapInputStruct,
  DeploySwapInputStruct,
} from "../../build/typechain/PermissionlessDeployer"
import { PoolType } from "../../utils/constants"
import {
  impersonateAccount,
  asyncForEach,
  MAX_UINT256
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
const USDC_CONTRACT_ADDRESS = "USDC"
const DAI_CONTRACT_ADDRESS = "DAI"
const FRAX_CONTRACT_ADDRESS = "FRAX"
const SUSD_CONTRACT_ADDRESS = "SUSD"
const BYTES32_FRAX_POOL_NAME = ethers.utils.formatBytes32String(TEST_FRAX_USD_POOL_NAME)
const BYTES32_FRAX_METAPOOL_NAME = ethers.utils.formatBytes32String(TEST_FRAX_USD_METAPOOL_NAME)




describe("PermissionlessDeployer", async () => {
  let signers: Array<Signer>
  let deployer: Signer
  let user1: Signer
  let user2: Signer
  let deployerAddress: string
  let user1Address: string
  let user2Address: string
  let poolRegistry: PoolRegistry
  let masterRegistry: MasterRegistry
  let masterRegistryFactory: ContractFactory
  let registryFactory: ContractFactory
  let permissionlessDeployer: PermissionlessDeployer
  let permissionlessSwap: PermissionlessSwap
  let deploySwapInput: DeploySwapInputStruct
  let deployMetaSwapInput: DeployMetaSwapInputStruct
  let usdv2Data: PoolDataStruct
  let susdMetaV2Data: PoolDataStruct
  let guardedBtcData: PoolDataStruct
  let usdv2InputData: PoolInputDataStruct
  let susdMetaV2InputData: PoolInputDataStruct
  let guardedBtcInputData: PoolInputDataStruct

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }) => {
      await deployments.fixture() // ensure you start from a fresh deployments

      signers = await ethers.getSigners()
      deployer = signers[0]
      user1 = signers[1]
      user2 = signers[2]
      deployerAddress = await deployer.getAddress()
      user1Address = ethers.utils.getAddress(await user1.getAddress())
      user2Address = ethers.utils.getAddress(await user2.getAddress())
      permissionlessDeployer = (await ethers.getContract(
        "PermissionlessDeployer",
      )) as PermissionlessDeployer
      poolRegistry = (await ethers.getContract("PoolRegistry")) as PoolRegistry
      masterRegistry = (await ethers.getContract("MasterRegistry")) as MasterRegistry
      permissionlessSwap = (await ethers.getContract(
        "PermissionlessSwapFlashLoan",
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
        (await get(USDC_CONTRACT_ADDRESS)).address,
        (await get(DAI_CONTRACT_ADDRESS)).address,
        (await get(FRAX_CONTRACT_ADDRESS)).address,
      ],
      decimals: [6, 18, 18],
      lpTokenName: TEST_FRAX_LP_TOKEN_NAME,
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
    const poolData: PoolDataStruct = await poolRegistry.getPoolDataByName(
      ethers.utils.formatBytes32String(TEST_FRAX_USD_POOL_NAME),
    )

    // Deploys a community meta pool and registers it in the PoolRegistry
    deployMetaSwapInput = {
      poolName: BYTES32_FRAX_METAPOOL_NAME,
      tokens: [(await get(SUSD_CONTRACT_ADDRESS)).address, poolData.lpToken],
      decimals: [18, 18],
      lpTokenName: TEST_FRAX_USD_METAPOOL_NAME,
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
      const poolData: PoolDataStruct = await poolRegistry.getPoolDataByName(
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
      const poolData: PoolDataStruct = await poolRegistry.getPoolDataByName(
        BYTES32_FRAX_METAPOOL_NAME,
      )
      expect(poolData.poolName).to.equal(
        BYTES32_FRAX_METAPOOL_NAME,
      )
    })
  })

  describe("poolRegistryCached", () => {
    it("Successfully reads poolRegistryCached ", async () => {
      expect(await permissionlessDeployer.poolRegistryCached()).to.eq(
        (await get("PoolRegistry")).address,
      )
    })
  })

  describe("setTargetLPToken", () => {
    it("Successfully sets targetLPToken", async () => {
      // Using an arbitrary address to test
      const targetLPToken = (await get("DAI")).address
      await permissionlessDeployer.setTargetLPToken(targetLPToken)
      expect(await permissionlessDeployer.targetLPToken()).to.eq(targetLPToken)
    })
  })

  describe("setTargetSwap", () => {
    it("Successfully sets targetSwap", async () => {
      // Using an arbitrary address to test
      const targetSwap = (await get("DAI")).address
      await permissionlessDeployer.setTargetSwap(targetSwap)
      expect(await permissionlessDeployer.targetSwap()).to.eq(targetSwap)
    })
  })

  describe("setTargetMetaSwap", () => {
    it("Successfully sets targetMetaSwap", async () => {
      // Using an arbitrary address to test
      const targetMetaSwap = (await get("DAI")).address
      await permissionlessDeployer.setTargetMetaSwap(targetMetaSwap)
      expect(await permissionlessDeployer.targetMetaSwap()).to.eq(
        targetMetaSwap,
      )
    })
  })

  describe("setTargetMetaSwapDeposit", () => {
    it("Successfully sets targetMetaSwapDeposit", async () => {
      // Using an arbitrary address to test
      const targetMetaSwapDeposit = (await get("DAI")).address
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

      const poolData: PoolDataStruct = await poolRegistry.getPoolDataByName(BYTES32_FRAX_POOL_NAME)
      const permissionlessSwapContract = await ethers.getContractAt("PermissionlessSwap", poolData.poolAddress)


      // Approve transfer of base pool tokens
      await asyncForEach(poolData.tokens, async (token) => {
        const tokenContract = await ethers.getContractAt("GenericERC20", token)
        await tokenContract.approve(permissionlessSwapContract.address, MAX_UINT256)
      })

      // Add liquidity
      await permissionlessSwapContract
        .addLiquidity(
          [String(3e6), String(3e18), String(3e18)],
          0,
          MAX_UINT256,
        )

      let baseLPToken: LPToken = await ethers.getContractAt("LPToken", poolData.lpToken)
      const actualPoolTokenAmount = await baseLPToken.balanceOf(deployerAddress)

      // The actual pool token amount is less than 4e18 due to the imbalance of the underlying tokens
      expect(actualPoolTokenAmount).to.eq(BigNumber.from(String(9e18)))

      // Function to return map of current token balances
      async function getTokenBalances(tokenAddresses: string[], userAddress: string) {
        const balances: BigNumber[] = []
        await asyncForEach(tokenAddresses, async (tokenAddress) => {
          const tokenContract = await ethers.getContractAt("GenericERC20", tokenAddress)
          const token_balance = await tokenContract.balanceOf(userAddress)
          balances.push(token_balance)
        })
        return balances
      }

      // swap each token 20 times
      for (let i = 0; i < 20; i++) {
        await permissionlessSwapContract.swap(0, 1, 1e6, 0, MAX_UINT256)
        await permissionlessSwapContract.swap(0, 2, 1e6, 0, MAX_UINT256)
        await permissionlessSwapContract.swap(1, 0, String(1e18), 0, MAX_UINT256)
        await permissionlessSwapContract.swap(1, 2, String(1e18), 0, MAX_UINT256)
        await permissionlessSwapContract.swap(2, 0, String(1e18), 0, MAX_UINT256)
        await permissionlessSwapContract.swap(2, 1, String(1e18), 0, MAX_UINT256)
      }

      // get balances of each token after the swaps
      const feeCollectorBalances = await getTokenBalances(poolData.tokens, deployerAddress)

      // withdraw admin fees
      await permissionlessSwapContract.connect(user1).withdrawAdminFees()

      // expect correct changes in token balances after admin fee withdrawal
      const feeCollectorBalancesWithFees = await getTokenBalances(poolData.tokens, deployerAddress)
      const user1BalancesWithFees = await getTokenBalances(poolData.tokens, user1Address)

      expect(user1BalancesWithFees.every((value) => value.gt(BigNumber.from(0)))).to.be.true

      for (let i = 0; i < feeCollectorBalances.length; i++) {
        expect(feeCollectorBalances[i]).to.lt(feeCollectorBalancesWithFees[i])
      }

      // Metapool

      const metaPoolData: PoolDataStruct = await poolRegistry.getPoolDataByName(BYTES32_FRAX_METAPOOL_NAME,)
      const permissionlessMetaSwapContract = await ethers.getContractAt("PermissionlessMetaSwap", metaPoolData.poolAddress)

      // Approve transfer of base pool and meta pool token

      const metaLPToken = await ethers.getContractAt("LPToken", metaPoolData.lpToken)
      const sUSDContract = await ethers.getContractAt("GenericERC20", metaPoolData.tokens[0])
      await baseLPToken.approve(permissionlessMetaSwapContract.address, MAX_UINT256)
      await sUSDContract.approve(permissionlessMetaSwapContract.address, MAX_UINT256)
      console.log("baselp token balance of", String(await baseLPToken.balanceOf(deployerAddress)))
      console.log("susd token balance of", String(await sUSDContract.balanceOf(deployerAddress)))

      // Add liquidity to metapool
      await permissionlessMetaSwapContract
        .addLiquidity(
          [String(3e18), String(3e18)],
          0,
          MAX_UINT256,
        )

      expect(metaLPToken.balanceOf(deployerAddress)).to.be.gt(BigNumber.from(0))

      // // Function to return map of current token balances
      // async function getTokenBalances(userAddress: string) {
      //   const balances: BigNumber[] = []
      //   balances.push(await sUSDContract.balanceOf(deployerAddress))
      //   balances.push(await baseLPToken.balanceOf(deployerAddress))
      //   return balances
      // }

      // const metaLPTokenBal = await baseLPToken.balanceOf(poolData.lpToken)

      // // swap each token 20 times
      // for (let i = 0; i < 20; i++) {
      //   await permissionlessSwapContract.swap(0, 1, String(1e18), 0, MAX_UINT256)
      //   await permissionlessSwapContract.swap(1, 0, String(1e18), 0, MAX_UINT256)
      // }

      // // get balances of each token after the swaps
      // const feeCollectorBalances = await getTokenBalances(deployerAddress)

      // // withdraw admin fees
      // await permissionlessSwapContract.connect(user1).withdrawAdminFees()

      // // expect correct changes in token balances after admin fee withdrawal
      // const feeCollectorBalancesWithFees = await getTokenBalances(deployerAddress)
      // const user1BalancesWithFees = await getTokenBalances(user1Address)

      // expect(user1BalancesWithFees.every((value) => value.gt(BigNumber.from(0)))).to.be.true

      // for (let i = 0; i < feeCollectorBalances.length; i++) {
      //   expect(feeCollectorBalances[i]).to.lt(feeCollectorBalancesWithFees[i])
      // }



    })
  })
})
