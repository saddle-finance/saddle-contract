import { DeployFunction } from "hardhat-deploy/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { PoolRegistry } from "../../build/typechain"
import {
  MULTISIG_ADDRESSES,
  OPS_MULTISIG_ADDRESSES,
} from "../../utils/accounts"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId, ethers } = hre
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("PoolRegistry", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [deployer, MULTISIG_ADDRESSES[await getChainId()]],
  })

  const contract = (await ethers.getContract("PoolRegistry")) as PoolRegistry
  const batchCall = [
    // Give the ops multisig the saddle & community manager role, revoke deployer's roles
    await contract.populateTransaction.grantRole(
      await contract.SADDLE_MANAGER_ROLE(),
      OPS_MULTISIG_ADDRESSES[await getChainId()],
    ),
    await contract.populateTransaction.grantRole(
      await contract.COMMUNITY_MANAGER_ROLE(),
      OPS_MULTISIG_ADDRESSES[await getChainId()],
    ),
    await contract.populateTransaction.revokeRole(
      await contract.SADDLE_MANAGER_ROLE(),
      deployer,
    ),
    await contract.populateTransaction.revokeRole(
      await contract.COMMUNITY_MANAGER_ROLE(),
      deployer,
    ),
    // After roles are set, give admin access to the multisig
    await contract.populateTransaction.grantRole(
      await contract.DEFAULT_ADMIN_ROLE(),
      OPS_MULTISIG_ADDRESSES[await getChainId()],
    ),
    await contract.populateTransaction.revokeRole(
      await contract.DEFAULT_ADMIN_ROLE(),
      deployer,
    ),
  ]

  const batchCallData = batchCall
    .map((x) => x.data)
    .filter((x): x is string => !!x)

  await execute(
    "PoolRegistry",
    { from: deployer, log: true },
    "batch",
    batchCallData,
    true,
  )
}
export default func
func.tags = ["PoolRegistry"]
