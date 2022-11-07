import dotenv from "dotenv"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { deployPermissionlessPoolComponents } from "../deployUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  dotenv.config()
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, getOrNull, execute } = deployments
  const { deployer } = await getNamedAccounts()

  // deploying first instance of MetaSwapDeposit on this chain
  const metaSwapDepositDeployment = await deploy("MetaSwapDeposit", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
  })

  await deployPermissionlessPoolComponents(hre)
}
export default func
func.tags = ["PermissionlessSwaps"]
func.dependencies = [
  "MasterRegistry",
  "PoolRegistry",
  "SwapUtils",
  "AmplificationUtils",
  "MetaSwapUtils",
  "LPToken",
]
// func.skip = async (env) => (await env.getChainId()) == CHAIN_ID.MAINNET
