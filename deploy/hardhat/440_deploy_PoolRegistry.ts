import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { MULTISIG_ADDRESSES } from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getUnnamedAccounts, getChainId } = hre
  const { deploy } = deployments
  const deployer = (await hre.ethers.getSigners())[0].address

  const chaindId = await getChainId()

  await deploy("PoolRegistry", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [deployer, MULTISIG_ADDRESSES[chaindId]],
  })
  // NOTE: manager role is given to deployer and admin role to multisig
}
export default func
func.tags = ["PoolRegistry"]
