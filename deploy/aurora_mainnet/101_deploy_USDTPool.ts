import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deploySwapFlashLoan } from "../deployUtils"

// Deployment Names
const POOL_NAME = "SaddleUSDTPool"

// Constructor arguments
const TOKEN_NAMES = ["USDC", "USDT"]
const TOKEN_DECIMALS = [6, 6]
const LP_TOKEN_NAME = "Saddle USDC/USDT LP Token"
const LP_TOKEN_SYMBOL = "saddleUSDCUSDT"
const INITIAL_A = 500
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 5e9 // 50% of the 4bps

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deploySwapFlashLoan(
    hre,
    POOL_NAME,
    TOKEN_NAMES,
    TOKEN_DECIMALS,
    LP_TOKEN_NAME,
    LP_TOKEN_SYMBOL,
    INITIAL_A,
    SWAP_FEE,
    ADMIN_FEE,
  )
}
export default func
func.tags = [POOL_NAME]
func.dependencies = [
  "SwapUtils",
  "SwapFlashLoan",
  "SwapDeployer",
  "USDTPoolTokens",
]
