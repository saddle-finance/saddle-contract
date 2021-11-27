import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { Deployment } from "hardhat-deploy/dist/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { execute, log, read, all } = deployments
  const { deployer } = await getNamedAccounts()

  const allContracts: { [p: string]: Deployment } = await all()

  const arr = []
  console.table(
    Object.keys(allContracts).map((k) => [k, allContracts[k].address]),
  )
}
export default func
func.tags = ["TransferOwnership"]
func.dependencies = ["Allowlist", "BTCPool", "USDPool"]
