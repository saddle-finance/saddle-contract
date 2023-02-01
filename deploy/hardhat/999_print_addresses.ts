import { Deployment } from "hardhat-deploy/dist/types"
import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { execute, log, read, all } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const allContracts: { [p: string]: Deployment } = await all()

  const arr = []
  console.table(
    Object.keys(allContracts).map((k) => [k, allContracts[k].address]),
  )
}
export default func
func.tags = ["TransferOwnership"]
func.dependencies = ["Allowlist", "BTCPool", "USDPool"]
