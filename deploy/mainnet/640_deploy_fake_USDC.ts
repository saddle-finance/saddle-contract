import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import path from "path"

const TOKENS_ARGS: { [token: string]: any[] } = {
  USDC_FAKE: ["USD coin", "USDC", "6"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute, log } = deployments
  const { deployer } = await getNamedAccounts()

  // Skip if we are not running on forked mainnet
  if (process.env.HARDHAT_DEPLOY_FORK == null) {
    log(`Not running on forked mode, skipping ${path.basename(__filename)}`)
    return
  }

  for (const token in TOKENS_ARGS) {
    await deploy(token, {
      from: deployer,
      log: true,
      contract: "GenericERC20",
      args: TOKENS_ARGS[token],
      skipIfAlreadyDeployed: true,
    })
    const decimals = TOKENS_ARGS[token][2]
    await execute(
      token,
      { from: deployer, log: true },
      "mint",
      deployer,
      BigNumber.from(10).pow(decimals).mul(1000000),
    )
  }
}
export default func
func.tags = ["USDC_FAKE"]
