import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { deployMetaswapDeposit } from "../deployUtils"

// Deployment names
const META_POOL_NAME = "SaddleFRAXUSXMetaPool"
const META_POOL_DEPOSIT_NAME = `${META_POOL_NAME}Deposit`
const BASE_POOL_NAME = `SaddleFRAXBPPool`

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await deployMetaswapDeposit(
    hre,
    META_POOL_DEPOSIT_NAME,
    BASE_POOL_NAME,
    META_POOL_NAME,
  )
}
export default func
func.tags = [META_POOL_DEPOSIT_NAME]
func.dependencies = ["FRAXUSXMetaPoolTokens", META_POOL_NAME]
