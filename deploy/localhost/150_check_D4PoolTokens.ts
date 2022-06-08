import { BigNumber } from "ethers"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { isTestNetwork } from "../../utils/network"

const D4_TOKENS_ARGS: { [token: string]: any[] } = {
  ALUSD: ["Alchemix USD", "alUSD", "18"],
  FEI: ["Fei Protocol", "FEI", "18"],
  FRAX: ["Frax", "FRAX", "18"],
  LUSD: ["Liquity USD", "LUSD", "18"],
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy, execute } = deployments
  const { deployer } = await getNamedAccounts()

  for (const token in D4_TOKENS_ARGS) {
    await deploy(token, {
      from: deployer,
      log: true,
      contract: "GenericERC20",
      args: D4_TOKENS_ARGS[token],
      skipIfAlreadyDeployed: true,
    })
    // If it's on hardhat, mint test tokens
    if (isTestNetwork(await getChainId())) {
      const decimals = D4_TOKENS_ARGS[token][2]
      await execute(
        token,
        { from: deployer, log: true },
        "mint",
        deployer,
        BigNumber.from(10).pow(decimals).mul(1000),
      )
    }
  }
}
export default func
func.tags = ["D4PoolTokens"]
