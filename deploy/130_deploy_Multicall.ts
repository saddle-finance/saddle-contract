import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { CHAIN_ID } from "../utils/network"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()
  const chainId = await getChainId()

  let contract = "Multicall"

  if (
    chainId == CHAIN_ID.OPTIMISM_KOVAN ||
    chainId == CHAIN_ID.OPTIMISM_HARDHAT
  ) {
    contract = "MulticallOVM"
  }

  await deploy("Multicall", {
    from: deployer,
    contract: contract,
    log: true,
    skipIfAlreadyDeployed: true,
  })
}
export default func
func.tags = ["Multicall"]
