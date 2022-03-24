import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const chaindId = await getChainId()

  await deploy("PoolRegistry", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [deployer, MULTISIG_ADDRESSES[chaindId]],
  })
  // NOTE: admin is set to deployer temporarily so that
  // we can assign COMMUNITY_MANAGER_ROLE to PermissionlessDeployer contract
}
export default func
func.tags = ["PoolRegistry"]
