import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { deploySwapFlashLoan } from "../deployUtils"

// Deployment Names
const POOL_NAME = "SaddleUSXPool"

// Constructor arguments
const TOKEN_NAMES = ["USDC", "USX"]
const TOKEN_DECIMALS = [6, 18]
const LP_TOKEN_NAME = "Saddle USDC/USX LP Token"
const LP_TOKEN_SYMBOL = "saddleUSX"
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
  "USXPoolTokens",
]
