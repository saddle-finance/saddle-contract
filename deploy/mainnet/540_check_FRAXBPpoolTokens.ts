import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { checkTokens } from "../deployUtils"

const USD_TOKENS_ARGS: { [token: string]: any[] } = {
  USDC: ["USD Coin", "USDC", "6"],
  FRAX: ["Frax", "FRAX", "18"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  await checkTokens(hre, USD_TOKENS_ARGS)
}
export default func
func.tags = ["fraxBPpoolTokens"]
