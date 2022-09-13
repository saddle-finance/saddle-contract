import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

import { PoolData, deploySwapFlashLoanPools } from "../deployUtils"

// SwapFlashLoan Inputs
const swapPools: PoolData[] = [
  // pool will deploy since a deployement is not found
  {
    poolName: "SaddleUSDTPool",
    registryName: "USDC-USDT",
    tokenArgs: {
      USDC: ["USD Coin", "USDC", "6"],
      USDT: ["Tether", "USDT", "6"],
    },
    lpTokenSymbol: "saddleUSDCUSDT",
    initialA: 500,
    swapFee: 4e6,
    adminFee: 50e8,
    multisig: false,
  },
]

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deploySwapFlashLoanPools(hre, swapPools)
}

export default func
func.tags = ["poolDeployments"]
