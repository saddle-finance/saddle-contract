import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { deployMetaswap } from "../deployUtils"

// Deployment names
const META_POOL_NAME = "SaddleFRAXUSDsMetaPool"
const BASE_POOL_NAME = "SaddleFRAXBPPool"

// Constructor arguments
const TOKEN_NAMES = ["USDs", `${BASE_POOL_NAME}LPToken`]
const TOKEN_DECIMALS = [18, 18]
const LP_TOKEN_NAME = "Saddle USDs/saddleFraxBP LP Token"
const LP_TOKEN_SYMBOL = "saddleFraxUSDs"
const INITIAL_A = 100
const SWAP_FEE = 4e6 // 4bps
const ADMIN_FEE = 50e8

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployMetaswap(
    hre,
    META_POOL_NAME,
    BASE_POOL_NAME,
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
func.tags = [META_POOL_NAME]
func.dependencies = ["LPToken", "FRAXUSDSMetaPoolTokens", "SaddleFRAXBPPool"]
