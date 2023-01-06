import dotenv from "dotenv"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../../utils/network"
import { deployPermissionlessPoolComponents } from "../deployUtils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  dotenv.config()
  const { deployments, getNamedAccounts } = hre
  const { get } = deployments
  const { deployer } = await getNamedAccounts()

  // await setEtherBalance(deployer, hre.ethers.constants.WeiPerEther.mul(1000))
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

func.skip = async (env) => (await env.getChainId()) == CHAIN_ID.AURORA_MAINNET
