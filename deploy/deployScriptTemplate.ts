import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import {
  deployMetaswapPools,
  deploySwapFlashLoanPools,
  PoolData,
} from "./deployUtils"

// SwapFlashLoan Inputs
const swapPools: PoolData[] = [
  // pool will deploy since a deployement is not found
  {
    poolName: "testalUSDFRAXPool",
    registryName: "USDX-FRAX",
    tokenArgs: {
      ALUSD: ["Alchemix USD", "alUSD", "18"],
      FRAX: ["Frax", "FRAX", "18"],
    },
    lpTokenSymbol: "saddleDAIFRAX",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
  },
  // pool will not deploy
  {
    poolName: "SaddleFRAXBPPool",
    registryName: "USDC-FRAX",
    tokenArgs: {
      USDC: ["USD Coin", "USDC"],
      FRAX: ["Frax", "FRAX"],
    },
    lpTokenSymbol: "saddleFraxBP",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
  },
]

// Metaswap Inputs
const metaPools: PoolData[] = [
  // pool will deploy since a deployement is not found
  {
    poolName: "testalUSDFRAXBPMetaPool",
    registryName: "test-USDX-FRAX",
    basePoolName: "SaddleFRAXBPPool",
    tokenArgs: {
      DAI: ["Dai", "DAI", "18"],
    },
    lpTokenSymbol: "saddleFRAXDAIUSD",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
  },
  // pool will not deploy
  {
    poolName: "SaddleFRAXUSDTMetaPool",
    registryName: "USDT-FRAX",
    basePoolName: "SaddleFRAXBPPool",
    tokenArgs: {
      USDT: ["Tether", "USDT", "18"],
    },
    lpTokenSymbol: "saddleFraxUSDT",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: true,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployMetaswapPools(hre, metaPools)
  await deploySwapFlashLoanPools(hre, swapPools)
}

export default func
func.tags = ["poolDeployments"]
