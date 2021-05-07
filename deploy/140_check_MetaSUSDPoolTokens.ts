import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { CHAIN_ID } from "../utils/network"
import { BigNumber } from "ethers"

const META_SUSD_TOKENS_ARGS: { [token: string]: Record<string, any> } = {
  SUSD: {
    args: ["Synthetic USD", "sUSD", "18"],
    mintAmount: 1000,
  },
  SaddleUSDPoolLPToken: {
    args: ["Saddle DAI/USDC/USDT", "saddleUSD", "18"],
    mintAmount: 0,
  },
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute } = deployments
  const { deployer } = await getNamedAccounts()

  for (const token in META_SUSD_TOKENS_ARGS) {
    await deploy(token, {
      from: deployer,
      log: true,
      contract: "GenericERC20",
      args: META_SUSD_TOKENS_ARGS[token].args,
      skipIfAlreadyDeployed: true,
    })
    // If it's on hardhat, mint test tokens
    if ((await getChainId()) == CHAIN_ID.HARDHAT) {
      const decimals = META_SUSD_TOKENS_ARGS[token].args[2]
      const mintAmount = META_SUSD_TOKENS_ARGS[token].mintAmount
      if (mintAmount > 0) {
        await execute(
          token,
          { from: deployer, log: true },
          "mint",
          deployer,
          BigNumber.from(10).pow(decimals).mul(mintAmount),
        )
      }
    }
  }
}
export default func
func.tags = ["MetaSUSDPoolTokens"]
func.dependencies = ["USDPool"]
