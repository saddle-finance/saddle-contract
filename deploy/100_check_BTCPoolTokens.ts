import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const BTC_TOKENS_ARGS: { [token: string]: any[] } = {
  TBTC: ["tBTC", "TBTC", "18"],
  WBTC: ["Wrapped Bitcoin", "WBTC", "8"],
  RENBTC: ["renBTC", "RENBTC", "8"],
  SBTC: ["sBTC", "SBTC", "18"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  for (const token in BTC_TOKENS_ARGS) {
    await deploy(token, {
      from: deployer,
      log: true,
      contract: "GenericERC20",
      args: BTC_TOKENS_ARGS[token],
      skipIfAlreadyDeployed: true,
    })
  }
}
export default func
func.tags = ["BTCPoolTokens"]
