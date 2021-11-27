import { BigNumber } from "ethers"
import { isTestNetwork } from "../../utils/network"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const BTC_TOKENS_ARGS: { [token: string]: any[] } = {
  WBTC: ["Wrapped Bitcoin", "WBTC", "8"],
  RENBTC: ["renBTC", "RENBTC", "8"],
  SBTC: ["sBTC", "SBTC", "18"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute } = deployments
  const { deployer } = await getNamedAccounts()

  for (const token in BTC_TOKENS_ARGS) {
    await deploy(token, {
      from: deployer,
      log: true,
      contract: "GenericERC20",
      args: BTC_TOKENS_ARGS[token],
      skipIfAlreadyDeployed: true,
    })
    // If it's on hardhat, mint test tokens
    if (isTestNetwork(await getChainId())) {
      const decimals = BTC_TOKENS_ARGS[token][2]
      await execute(
        token,
        { from: deployer, log: true },
        "mint",
        deployer,
        BigNumber.from(10).pow(decimals).mul(10000),
      )
    }
  }
}
export default func
func.tags = ["BTCPoolV2Tokens"]
