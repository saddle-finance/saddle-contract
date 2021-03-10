import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const BTC_TOKENS_ARGS: { [token: string]: any[] } = {
  DAI: ["Dai Stablecoin", "DAI", "18"],
  USDC: ["USD Coin", "USDC", "6"],
  USDT: ["Tether USD", "USDT", "6"],
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
func.tags = ["USDPoolTokens"]
