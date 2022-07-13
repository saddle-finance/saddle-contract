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
    poolName: "testDAIFRAXPool",
    tokenNames: ["FEI", "ALUSD"],
    lpTokenSymbol: "saddleDAIFRAX",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
  // pool will not deploy
  {
    poolName: "SaddleFRAXBPPool",
    tokenNames: ["USDC", "FRAX"],
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
    poolName: "testDAIFRAXBPMetaPool",
    basePoolName: "SaddleFRAXBPPool",
    tokenNames: ["DAI"],
    lpTokenSymbol: "saddleFRAXDAIUSD",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
  // pool will not deploy
  {
    poolName: "SaddleFRAXUSDTMetaPool",
    basePoolName: "SaddleFRAXBPPool",
    tokenNames: ["USDT"],
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
