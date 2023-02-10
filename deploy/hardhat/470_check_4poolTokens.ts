import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const USD_TOKENS_ARGS: { [token: string]: any[] } = {
  DAI: ["Dai Stablecoin", "DAI", "18"],
  USDC: ["USD Coin", "USDC", "6"],
  USDT: ["Tether USD", "USDT", "6"],
  FRAX: ["Frax", "FRAX", "18"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy, execute, getOrNull, log } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  for (const token in USD_TOKENS_ARGS) {
    const token_contracts = await getOrNull(token)
    if (!token_contracts) {
      await deploy(token, {
        from: deployer,
        log: true,
        contract: "GenericERC20",
        args: USD_TOKENS_ARGS[token],
        skipIfAlreadyDeployed: true,
      })
      // If it's on hardhat, mint test tokens
      if (isTestNetwork(await getChainId())) {
        const decimals = USD_TOKENS_ARGS[token][2]
        await execute(
          token,
          { from: deployer, log: true },
          "mint",
          deployer,
          BigNumber.from(10).pow(decimals).mul(1000000),
        )
      }
    } else {
      log(`reusing ${token} at ${token_contracts.address}`)
    }
  }
}
export default func
func.tags = ["4poolTokens"]
