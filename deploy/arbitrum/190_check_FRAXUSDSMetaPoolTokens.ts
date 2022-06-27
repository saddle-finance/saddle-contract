import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { checkTokens } from "../deployUtils"

const USD_TOKENS_ARGS: { [token: string]: any[] } = {
  USDs: ["USDs", "USDS", "18"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await checkTokens(hre, USD_TOKENS_ARGS)
}
export default func
func.tags = ["FRAXUSDSMetaPoolTokens"]
func.dependencies = ["SaddleFRAXBPPool"]
