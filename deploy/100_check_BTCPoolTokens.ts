import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { getChainId } from "hardhat-deploy/dist/src/utils"
import { CHAIN_ID } from "../utils/network"
import { DeployResult } from "hardhat-deploy/dist/types"
import { BigNumber } from "ethers"

const BTC_TOKENS_ARGS: { [token: string]: any[] } = {
  TBTC: ["tBTC", "TBTC", "18"],
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
    if ((await getChainId()) == CHAIN_ID.HARDHAT) {
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
func.tags = ["BTCPoolTokens"]
