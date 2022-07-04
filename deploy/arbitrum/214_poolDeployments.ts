import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import {
  IPoolDataInput,
  IMetaPoolDataInput,
  deployMetaswap2,
  deploySwapFlashLoan2,
} from "../deployUtils"

// Swap Flash Loan Inputs
const swapPools: IPoolDataInput[] = [
  {
    poolName: "testMIMFRAXPool",
    tokenNames: ["MIM", "FRAX"],
    lpTokenSymbol: "saddleDAIArbUSD",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
]

// Metaswap Inputs
const metaPools: IMetaPoolDataInput[] = [
  {
    metaPoolName: "testDAIUSDMetaPool",
    basePoolName: "SaddleArbUSDPool",
    tokenNames: ["MIM"],
    lpTokenSymbol: "saddleDAIArbUSD",
    initialA: 100,
    swapFee: 4e6,
    adminFee: 50e8,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // await deployMetaswap2(hre, metaPools)
  await deploySwapFlashLoan2(hre, swapPools)
}

export default func
func.tags = ["test deploys"]
// func.dependencies = ["LPToken", "SaddleArbUSDPool"]
