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
import { PermissionlessDeployer } from "../../build/typechain"
import {
  DeployMetaSwapInputStruct,
  DeploySwapInputStruct,
} from "../../build/typechain/PermissionlessDeployer"
import { PoolType } from "../../utils/constants"

chai.use(solidity)
const { expect } = chai
const { get } = deployments

describe("PermissionlessDeployer", async () => {
  let signers: Array<Signer>
  let deployer: Signer
  let deployerAddress: string
  let poolRegistry: PoolRegistry
  let registryFactory: ContractFactory
  let permissionlessDeployer: PermissionlessDeployer
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
      deployerAddress = await deployer.getAddress()
      permissionlessDeployer = (await ethers.getContract(
        "PermissionlessDeployer",
      )) as PermissionlessDeployer
      poolRegistry = (await ethers.getContract("PoolRegistry")) as PoolRegistry
    },
  )

  beforeEach(async () => {
    await setupTest()
  })

  async function testDeploySwap() {
    // Deploys a community pool and registers it in the PoolRegistry
    deploySwapInput = {
      poolName: ethers.utils.formatBytes32String("FraxUSD"),
      tokens: [
        (await get("USDC")).address,
        (await get("DAI")).address,
        (await get("FRAX")).address,
      ],
      decimals: [6, 18, 18],
      lpTokenName: "FraxUSD LP Token",
      lpTokenSymbol: "FraxUSD",
      a: BigNumber.from(1000),
      fee: BigNumber.from(0.04e8), // 4bps
      adminFee: BigNumber.from(50e8), // 50%
      owner: deployerAddress,
      typeOfAsset: PoolType.USD,
    }
    await permissionlessDeployer.deploySwap(deploySwapInput)
  }

  async function testDeployMetaSwap() {
    const poolData: PoolDataStruct = await poolRegistry.getPoolDataByName(
      ethers.utils.formatBytes32String("FraxUSD"),
    )

    // Deploys a community meta pool and registers it in the PoolRegistry
    deployMetaSwapInput = {
      poolName: ethers.utils.formatBytes32String("sUSD-FraxUSD"),
      tokens: [(await get("SUSD")).address, poolData.lpToken],
      decimals: [18, 18],
      lpTokenName: "sUSD-FraxUSD LP Token",
      lpTokenSymbol: "sUSD-FraxUSD",
      a: BigNumber.from(1000),
      fee: BigNumber.from(0.04e8), // 4bps
      adminFee: BigNumber.from(50e8), // 50%
      owner: deployerAddress,
      typeOfAsset: PoolType.USD,
      baseSwap: poolData.poolAddress,
    }
    await permissionlessDeployer.deployMetaSwap(deployMetaSwapInput)
  }

  describe("deploySwap", () => {
    it("Successfully deploys Swap", async () => {
      await testDeploySwap()
      const poolData: PoolDataStruct = await poolRegistry.getPoolDataByName(
        ethers.utils.formatBytes32String("FraxUSD"),
      )
      expect(poolData.poolName).to.equal(
        ethers.utils.formatBytes32String("FraxUSD"),
      )
    })
  })

  describe("deployMetaSwap", () => {
    it("Successfully deploys Swap", async () => {
      await testDeploySwap()
      await testDeployMetaSwap()
      const poolData: PoolDataStruct = await poolRegistry.getPoolDataByName(
        ethers.utils.formatBytes32String("sUSD-FraxUSD"),
      )
      expect(poolData.poolName).to.equal(
        ethers.utils.formatBytes32String("sUSD-FraxUSD"),
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
})
