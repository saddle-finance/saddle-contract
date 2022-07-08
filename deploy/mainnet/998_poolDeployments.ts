import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import {
  IPoolDataInput,
  deployMetaswapPools,
  deploySwapFlashLoanPools,
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
    poolName: "testDAIFRAXBPMetaPool",
    basePoolName: "SaddleFRAXBPPool",
    tokenNames: ["DAI"],
    lpTokenSymbol: "saddleFRAXDAIUSD",
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
func.tags = ["test deploys"]
// func.dependencies = ["LPToken", "SaddleArbUSDPool"]
