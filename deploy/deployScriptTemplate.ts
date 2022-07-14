import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import {
  IPoolDataInput,
  deployMetaswapPools,
  deploySwapFlashLoanPools,
} from "./deployUtils"

// SwapFlashLoan Inputs
const swapPools: IPoolDataInput[] = [
  // pool will deploy since a deployement is not found
  {
    poolName: "testalUSDFRAXPool",
    tokenArgs: {
      ALUSD: ["Alchemix USD", "alUSD", "18"],
      FRAX: ["Frax", "FRAX", "18"],
    },
    lpTokenSymbol: "saddleDAIFRAX",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
  // pool will not deploy
  {
    poolName: "SaddleFRAXBPPool",
    tokenArgs: {
      USDC: ["USD Coin", "USDC"],
      FRAX: ["Frax", "FRAX"],
    },
    lpTokenSymbol: "saddleFraxBP",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
]

// Metaswap Inputs
const metaPools: IPoolDataInput[] = [
  // pool will deploy since a deployement is not found
  {
    poolName: "testalUSDFRAXBPMetaPool",
    basePoolName: "SaddleFRAXBPPool",
    tokenArgs: {
      DAI: ["Dai", "DAI", "18"],
    },
    lpTokenSymbol: "saddleFRAXDAIUSD",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
  // pool will not deploy
  {
    poolName: "SaddleFRAXUSDTMetaPool",
    basePoolName: "SaddleFRAXBPPool",
    tokenArgs: {
      USDT: ["Tether", "USDT", "18"],
    },
    lpTokenSymbol: "saddleFraxUSDT",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployMetaswapPools(hre, metaPools)
  await deploySwapFlashLoanPools(hre, swapPools)
}

export default func
func.tags = ["poolDeployments"]
