import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { checkTokens } from "../deployUtils"

const USD_TOKENS_ARGS: { [token: string]: any[] } = {
  USDT: ["Tether USD", "USDT", "6"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await checkTokens(hre, USD_TOKENS_ARGS)
}

export default func
func.tags = ["FRAXUSDTMetaPoolTokens"]
func.dependencies = ["SaddleFRAXBPPool"]
