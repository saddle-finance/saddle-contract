import dotenv from "dotenv"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployPermissionlessPoolComponentsV2 } from "../deployUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  dotenv.config()

  await deployPermissionlessPoolComponentsV2(hre)
}
export default func
func.tags = ["PermissionlessSwaps"]
func.dependencies = [
  "MasterRegistry",
  "PoolRegistry",
  "SwapUtilsV2",
  "AmplificationUtilsV2",
  "MetaSwapUtilsV1",
  "LPTokenV2",
]
