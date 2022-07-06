import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import {
  IPoolDataInput,
  deployMetaswapV2,
  deploySwapFlashLoanV2,
} from "../deployUtils"

// Swap Flash Loan Inputs
const swapPools: IPoolDataInput[] = [
  {
    poolName: "testDAIFRAXPool",
    tokenNames: ["DAI", "FRAX"],
    lpTokenSymbol: "saddleDAIFRAX",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
]

// Metaswap Inputs
const metaPools: IPoolDataInput[] = [
  {
    poolName: "testDAIUSDMetaPool",
    basePoolName: "SaddleArbUSDPool",
    tokenNames: ["MIM"],
    lpTokenSymbol: "saddleDAIArbUSD",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // await deployMetaswapV2(hre, metaPools)
  await deploySwapFlashLoanV2(hre, swapPools)
}

export default func
func.tags = ["test deploys"]
// func.dependencies = ["LPToken", "SaddleArbUSDPool"]
